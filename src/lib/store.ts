export interface Participant { id: string; name: string; group_name: string }
export interface EventEntry  { time: number; action: string; type: string; score: number }
export interface EmotionPoint  { time: number; valence: number; arousal: number; stress: number }
export interface CognitivePoint { time: number; cognitive_load: number; mental_effort: number }
export interface Session {
  id: number; participant_id: string; session_label: string
  behavior_total: number; behavior_communication: number
  behavior_procedure: number; behavior_decision: number
  time_total: number; time_on_task: number; time_idle: number
  gaze_focus_rate: number; gaze_task_area: number; gaze_distraction: number
  cognitive_load: number; mental_effort: number
  emotion_positive: number; emotion_negative: number; arousal: number
  action_completion: number; error_count: number; optimal_path_rate: number
  event_log: EventEntry[]; emotion_timeline: EmotionPoint[]; cognitive_timeline: CognitivePoint[]
  created_at: string
}

const K = 'xrd_'

export const store = {
  getParticipants: (): Participant[] =>
    JSON.parse(localStorage.getItem(K + 'parts') || '[]'),

  saveParticipants: (list: Participant[]) =>
    localStorage.setItem(K + 'parts', JSON.stringify(list)),

  upsertParticipant(p: Participant) {
    const list = this.getParticipants()
    const idx = list.findIndex(x => x.id === p.id)
    if (idx >= 0) list[idx] = p; else list.push(p)
    this.saveParticipants(list)
  },

  getSessions: (pid: string): Session[] =>
    JSON.parse(localStorage.getItem(K + 'sess_' + pid) || '[]'),

  saveSessions: (pid: string, sessions: Session[]) =>
    localStorage.setItem(K + 'sess_' + pid, JSON.stringify(sessions)),

  addSession(pid: string, session: Omit<Session, 'id'>) {
    const sessions = this.getSessions(pid)
    sessions.push({ ...session, id: Date.now() })
    this.saveSessions(pid, sessions)
  },

  getApiKey: (): string => localStorage.getItem(K + 'apikey') || '',
  saveApiKey: (k: string) => localStorage.setItem(K + 'apikey', k),

  clear() {
    Object.keys(localStorage).filter(k => k.startsWith(K)).forEach(k => localStorage.removeItem(k))
  },

  getAllSessions(): Session[] {
    return this.getParticipants().flatMap(p => this.getSessions(p.id))
  },

  buildDashboard(pid: string) {
    const participant = this.getParticipants().find(p => p.id === pid)
    if (!participant) return { error: '참여자 없음' }
    const sessions = this.getSessions(pid)
    if (!sessions.length) return { error: '세션 데이터 없음' }

    const allScores = this.getAllSessions().map(s => s.behavior_total)
    const latest = sessions[sessions.length - 1]
    const score = latest.behavior_total
    const pct = allScores.length > 0
      ? Math.round(allScores.filter(v => v < score).length / allScores.length * 100) : 50
    const level = score < 40 ? 'novice' : score < 55 ? 'beginner' : score < 70 ? 'developing' : score < 85 ? 'proficient' : 'expert'

    const mn = Math.min(...allScores), mx = Math.max(...allScores)
    const step = (mx - mn) / 8
    const distribution = mn === mx
      ? [{ range: `${mn.toFixed(0)}`, count: allScores.length, isMe: true }]
      : Array.from({ length: 8 }, (_, i) => {
          const lo = mn + i * step, hi = i === 7 ? mx + 0.001 : mn + (i + 1) * step
          return { range: `${lo.toFixed(0)}-${hi.toFixed(0)}`,
            count: allScores.filter(v => v >= lo && v < hi).length, isMe: score >= lo && score < hi }
        })

    return {
      participant, latest, sessions, percentile: pct, level,
      all_scores: allScores, distribution,
      trend: sessions.map(s => ({ session: s.session_label, score: s.behavior_total,
        completion: s.action_completion, error: s.error_count })),
      videos: [],
    }
  },
}

// ── CSV import ──────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]))
  })
}

function f(row: Record<string, string>, key: string): number {
  return parseFloat(row[key] || '0') || 0
}

export function importCSV(text: string): number {
  const rows = parseCSV(text)
  let count = 0
  for (const row of rows) {
    const pid = row['participant_id']?.trim()
    if (!pid) continue
    store.upsertParticipant({ id: pid, name: row['name'] || pid, group_name: row['group_name'] || 'default' })
    store.addSession(pid, {
      participant_id: pid,
      session_label: row['session_id'] || 'Session 1',
      behavior_total: f(row, 'behavior_total'), behavior_communication: f(row, 'behavior_communication'),
      behavior_procedure: f(row, 'behavior_procedure'), behavior_decision: f(row, 'behavior_decision'),
      time_total: f(row, 'time_total'), time_on_task: f(row, 'time_on_task'), time_idle: f(row, 'time_idle'),
      gaze_focus_rate: f(row, 'gaze_focus_rate'), gaze_task_area: f(row, 'gaze_task_area'), gaze_distraction: f(row, 'gaze_distraction'),
      cognitive_load: f(row, 'cognitive_load'), mental_effort: f(row, 'mental_effort'),
      emotion_positive: f(row, 'emotion_positive'), emotion_negative: f(row, 'emotion_negative'), arousal: f(row, 'arousal'),
      action_completion: f(row, 'action_completion'), error_count: f(row, 'error_count'), optimal_path_rate: f(row, 'optimal_path_rate'),
      event_log: [], emotion_timeline: [], cognitive_timeline: [],
      created_at: new Date().toISOString(),
    })
    count++
  }
  return count
}
