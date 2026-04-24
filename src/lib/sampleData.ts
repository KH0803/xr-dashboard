import { store } from './store'
import type { Session, EventEntry, EmotionPoint, CognitivePoint } from './store'

class Rng {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 }
  next(): number {
    this.s = Math.imul(this.s, 1664525) + 1013904223
    return (this.s >>> 0) / 4294967296
  }
  uniform(a: number, b: number) { return a + this.next() * (b - a) }
  gauss(mean: number, std: number) {
    const u = Math.max(this.next(), 1e-10), v = this.next()
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  int(a: number, b: number) { return Math.floor(this.uniform(a, b)) }
  clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)) }
}

const ACTION_TYPES: [string, string][] = [
  ['환자 접근', 'correct'], ['기구 준비', 'correct'], ['청진기 사용', 'optimal'],
  ['활력징후 측정', 'correct'], ['약품 선택', 'correct'], ['잘못된 약품 선택', 'error'],
  ['의사소통 시도', 'correct'], ['절차 건너뜀', 'error'], ['최적 경로 수행', 'optimal'],
  ['보조 기구 사용', 'correct'], ['재시도', 'warning'], ['기록 작성', 'correct'],
  ['팀원 협력', 'optimal'], ['비효율 동작', 'warning'], ['최종 처치', 'correct'],
]

function makeEventLog(rng: Rng, totalTime: number, errorCount: number): EventEntry[] {
  const n = rng.int(8, 18)
  const times = Array.from({ length: n }, () => rng.uniform(0, totalTime)).sort((a, b) => a - b)
  return times.map(t => {
    const [action, typeRaw] = ACTION_TYPES[rng.int(0, ACTION_TYPES.length)]
    const type = typeRaw === 'error' && errorCount <= 0 ? 'warning' : typeRaw
    return { time: Math.round(t * 10) / 10, action, type,
      score: type === 'optimal' ? 2 : type === 'correct' ? 1 : type === 'error' ? -1 : 0 }
  })
}

function makeEmotionTimeline(rng: Rng, totalTime: number, pos: number, neg: number): EmotionPoint[] {
  return Array.from({ length: 13 }, (_, i) => ({
    time: Math.round(totalTime * i / 12 * 10) / 10,
    valence: rng.clamp(pos + rng.gauss(0, 5)),
    arousal: rng.clamp(60 + rng.gauss(0, 8)),
    stress: rng.clamp(neg + rng.gauss(0, 5)),
  }))
}

function makeCognitiveTimeline(rng: Rng, totalTime: number, cl: number, me: number): CognitivePoint[] {
  return Array.from({ length: 13 }, (_, i) => {
    const peak = 1 + 0.4 * Math.abs(Math.sin(i * 0.5))
    return {
      time: Math.round(totalTime * i / 12 * 10) / 10,
      cognitive_load: rng.clamp(cl * peak + rng.gauss(0, 5)),
      mental_effort: rng.clamp(me * peak + rng.gauss(0, 5)),
    }
  })
}

// (group, bmin, bmax, growthMin, growthMax, noise)
const TYPES: [string, number, number, number, number, number][] = [
  ['점차향상',  35, 50,  13, 17, 5],
  ['계속우수',  80, 90,   0,  3, 4],
  ['계속낮음',  18, 32,   0,  2, 4],
  ['안정향상',  55, 65,   3,  5, 4],
  ['하락경향',  75, 85, -14,-10, 4],
]

export function generateSampleData() {
  store.clear()
  const rng = new Rng(42)
  let pidNum = 1

  for (const [group, bmin, bmax, gmin, gmax, noise] of TYPES) {
    for (let m = 0; m < 4; m++) {
      const pid = `P${String(pidNum).padStart(3, '0')}`
      const name = `참여자${String(pidNum).padStart(2, '0')}`
      store.upsertParticipant({ id: pid, name, group_name: group })

      const base = rng.uniform(bmin, bmax)
      const sessions: Omit<Session, 'id'>[] = []

      for (let s = 1; s <= 3; s++) {
        const growth = (s - 1) * rng.uniform(gmin, gmax)
        const bTotal = rng.clamp(base + growth + rng.gauss(0, noise), 5, 98)
        const tTotal = rng.uniform(600, 1800)
        const err = Math.max(0, rng.uniform(0, 8) * (bTotal < 50 ? 1.5 : 0.6))
        const ep = rng.clamp(35 + bTotal * 0.55 + rng.gauss(0, 5), 20, 90)
        const en = rng.clamp(65 - bTotal * 0.45 + rng.gauss(0, 5), 5, 60)
        const cl = rng.uniform(30, 80), me = rng.uniform(30, 80)

        sessions.push({
          participant_id: pid,
          session_label: `Session ${s}`,
          behavior_total: Math.round(bTotal * 10) / 10,
          behavior_communication: rng.clamp(bTotal + rng.gauss(0, 8)),
          behavior_procedure: rng.clamp(bTotal + rng.gauss(0, 8)),
          behavior_decision: rng.clamp(bTotal + rng.gauss(0, 8)),
          time_total: Math.round(tTotal),
          time_on_task: Math.round(rng.uniform(400, 1400)),
          time_idle: Math.round(rng.uniform(50, 300)),
          gaze_focus_rate: Math.round(rng.uniform(50, 90) * 10) / 10,
          gaze_task_area: Math.round(rng.uniform(55, 85) * 10) / 10,
          gaze_distraction: Math.round(rng.uniform(5, 30) * 10) / 10,
          cognitive_load: Math.round(cl * 10) / 10,
          mental_effort: Math.round(me * 10) / 10,
          emotion_positive: Math.round(ep * 10) / 10,
          emotion_negative: Math.round(en * 10) / 10,
          arousal: Math.round(rng.uniform(40, 80) * 10) / 10,
          action_completion: Math.round(rng.uniform(50, 95) * 10) / 10,
          error_count: Math.round(err),
          optimal_path_rate: Math.round(rng.uniform(40, 90) * 10) / 10,
          event_log: makeEventLog(rng, tTotal, err),
          emotion_timeline: makeEmotionTimeline(rng, tTotal, ep, en),
          cognitive_timeline: makeCognitiveTimeline(rng, tTotal, cl, me),
          created_at: new Date().toISOString(),
        })
      }

      store.saveSessions(pid, sessions.map((s, i) => ({ ...s, id: i + 1 })))
      pidNum++
    }
  }
}
