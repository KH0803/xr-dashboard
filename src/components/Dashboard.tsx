import { useState, useEffect, useRef, useMemo } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area, ComposedChart, ReferenceLine
} from 'recharts'

interface Props { pid: string; name: string }

const GAZE_COLORS = ['#3fb950', '#58a6ff', '#f85149']
const EVENT_COLORS: Record<string, string> = {
  correct: '#3fb950', optimal: '#58a6ff', error: '#f85149', warning: '#d29922'
}
const LEVEL_CONFIG: Record<string, { label: string; color: string; next: string }> = {
  novice:     { label: '초보자',  color: '#f85149', next: '기초 절차 반복 연습 필요' },
  beginner:   { label: '입문자',  color: '#d29922', next: '의사결정 속도 향상 필요' },
  developing: { label: '발전 중', color: '#ffa657', next: '오류 감소·최적 경로 탐색' },
  proficient: { label: '숙련자',  color: '#58a6ff', next: '고난도 시나리오 도전 필요' },
  expert:     { label: '전문가',  color: '#3fb950', next: '현재 최고 단계 달성!' },
}
const INTERP: Record<string, string> = {
  radar: '레이더 차트는 6가지 역량을 전문가 기준(녹색)과 비교합니다. 파란 영역이 녹색 선에 가까울수록 좋으며, 좁아지는 꼭짓점이 우선 개선 영역입니다.',
  distribution: '집단 전체 점수 분포에서 현재 위치(주황색)를 보여줍니다. 오른쪽에 위치할수록 상위권에 해당합니다.',
  behaviorBar: '각 행동 영역별 점수(100점 만점)입니다. 상대적으로 낮은 영역이 집중 연습이 필요한 부분입니다.',
  eventFreq: '시뮬레이션 중 발생한 이벤트 유형별 빈도입니다. 정상·최적 비율이 높고 오류·경고가 낮을수록 좋습니다.',
  cognitive: '시뮬레이션 진행 중 인지부하와 정신적 노력의 변화입니다. 인지부하가 급등하는 구간은 어려움을 겪은 시점을 의미하며, 성찰 시 집중적으로 살펴보세요.',
  emotion: '긍정정서, 스트레스, 각성수준의 시간별 변화입니다. 스트레스가 높은 구간에서 어떤 상황이 있었는지 영상과 함께 확인하면 효과적입니다.',
  gaze: '시선이 과제 영역·집중 구역·분산 영역에 분포한 비율입니다. 과제 영역 비율이 높을수록 핵심 정보에 집중했음을 나타냅니다.',
  trend: '세션별 행동 점수(파란 영역), 과제완성률(녹색 선), 오류 횟수(빨간 막대)의 변화입니다. 점수 상승과 오류 감소가 동시에 나타나면 효과적인 학습이 이루어지고 있는 것입니다.',
}

function buildDistribution(allScores: number[], myScore: number) {
  if (!allScores.length) return []
  const mn = Math.min(...allScores), mx = Math.max(...allScores)
  if (mx === mn) return [{ range: `${mn.toFixed(0)}`, count: allScores.length, isMe: true }]
  const step = (mx - mn) / 8
  return Array.from({ length: 8 }, (_, i) => {
    const lo = mn + i * step
    const hi = i === 7 ? mx + 0.001 : mn + (i + 1) * step
    return {
      range: `${lo.toFixed(0)}-${hi.toFixed(0)}`,
      count: allScores.filter(v => v >= lo && v < hi).length,
      isMe: myScore >= lo && myScore < hi,
    }
  })
}

function GaugeChart({ value, max = 100, color = '#58a6ff' }: { value: number; max?: number; color?: string }) {
  const r = 54, cx = 70, cy = 70
  const startAngle = Math.PI * 0.8, endAngle = Math.PI * 2.2
  const totalArc = endAngle - startAngle
  const filledArc = totalArc * (value / max)
  const pt = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x1, y1] = pt(startAngle)
  const [x2bg, y2bg] = pt(endAngle)
  const [x2, y2] = pt(startAngle + filledArc)
  return (
    <svg width={140} height={90} viewBox="0 0 140 90">
      <path d={`M${x1},${y1} A${r},${r} 0 ${totalArc > Math.PI ? 1 : 0},1 ${x2bg},${y2bg}`}
        fill="none" stroke="var(--bg3)" strokeWidth={10} strokeLinecap="round" />
      {value > 0 && (
        <path d={`M${x1},${y1} A${r},${r} 0 ${filledArc > Math.PI ? 1 : 0},1 ${x2},${y2}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
      )}
      <text x={cx} y={cy + 16} textAnchor="middle" fill={color} fontSize={22} fontWeight={700}>{value.toFixed(0)}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fill="var(--muted)" fontSize={10}>/ {max}</text>
    </svg>
  )
}

function PercentileBar({ value }: { value: number }) {
  const color = value >= 75 ? '#3fb950' : value >= 50 ? '#58a6ff' : value >= 25 ? '#d29922' : '#f85149'
  const label = value >= 75 ? '상위권' : value >= 50 ? '중상위' : value >= 25 ? '중하위' : '하위권'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>집단 내 위치</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label} · 상위 {100 - value}%</span>
      </div>
      <div className="pct-bar">
        <div className="pct-fill" style={{ width: `${value}%`, background: color }} />
        <div className="pct-marker" style={{ left: `${value}%`, background: color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
        <span>하위</span><span>50%</span><span>상위</span>
      </div>
    </div>
  )
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="score-row">
      <span className="score-label">{label}</span>
      <div className="score-bar-wrap">
        <div className="score-bar-fill" style={{ width: `${Math.min(score, 100)}%`, background: color }} />
      </div>
      <span className="score-val" style={{ color }}>{score.toFixed(0)}</span>
    </div>
  )
}

function LevelIndicator({ level }: { level: string }) {
  const levels = ['novice', 'beginner', 'developing', 'proficient', 'expert']
  const idx = levels.indexOf(level)
  const cfg = LEVEL_CONFIG[level]
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {levels.map((l, i) => (
          <div key={l} style={{ flex: 1, height: 6, borderRadius: 3,
            background: i <= idx ? LEVEL_CONFIG[l].color : 'var(--bg3)', transition: 'background 0.3s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>🏆 {cfg.label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{idx + 1} / {levels.length} 단계</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>다음 단계: {cfg.next}</div>
    </div>
  )
}

function EventTimeline({ events, totalTime }: { events: any[]; totalTime: number }) {
  if (!events.length) return <div style={{ color: 'var(--muted)', fontSize: 12, padding: '12px 0' }}>이벤트 데이터 없음</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', height: 56, minWidth: 500, marginBottom: 4 }}>
        <div style={{ position: 'absolute', top: 26, left: 0, right: 0, height: 2, background: 'var(--border)', borderRadius: 1 }} />
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <div key={frac} style={{ position: 'absolute', top: 34, left: `${frac * 100}%`,
            fontSize: 10, color: 'var(--muted)', transform: 'translateX(-50%)' }}>
            {Math.round(totalTime * frac)}s
          </div>
        ))}
        {events.map((ev, i) => {
          const color = EVENT_COLORS[ev.type] || '#7d8590'
          return (
            <div key={i} style={{ position: 'absolute', left: `${(ev.time / totalTime) * 100}%`, top: 14, transform: 'translateX(-50%)' }}
              title={`${ev.time}s: ${ev.action}`}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid var(--bg2)', cursor: 'pointer' }} />
              {i % 3 === 0 && (
                <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 9, color, whiteSpace: 'nowrap', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.action}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        {Object.entries(EVENT_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--muted)' }}>
              {type === 'correct' ? '정상' : type === 'optimal' ? '최적' : type === 'error' ? '오류' : '경고'}
              ({events.filter(e => e.type === type).length})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SECTIONS = [
  { id: 'overview',   label: '📊 개요' },
  { id: 'video',      label: '🎬 영상' },
  { id: 'behavior',   label: '🎯 행동' },
  { id: 'cognition',  label: '🧠 인지·정서' },
  { id: 'gaze',       label: '👁 시선' },
  { id: 'trend',      label: '📈 추이' },
  { id: 'feedback',   label: '🤖 AI 피드백' },
]

export default function Dashboard({ pid, name }: Props) {
  const [data, setData]               = useState<any>(null)
  const [feedback, setFeedback]       = useState<any>(null)
  const [fbLoading, setFbLoading]     = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [selectedSession, setSelectedSession] = useState(0)
  const [interp, setInterp]           = useState<Set<string>>(new Set())
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const videoRef = useRef<HTMLInputElement>(null)

  const toggleInterp = (id: string) => setInterp(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  useEffect(() => {
    setData(null); setFeedback(null); setSelectedSession(0); setInterp(new Set())
    fetch(`/api/dashboard/${pid}`).then(r => r.json()).then(d => {
      setData(d)
      setSelectedSession((d.sessions?.length || 1) - 1)
    })
  }, [pid])

  // Derive current session — must be before any early returns (hooks rule)
  const sess = useMemo(
    () => data?.sessions?.[selectedSession] ?? data?.sessions?.[data?.sessions?.length - 1],
    [data, selectedSession]
  )
  const eventLog = useMemo(() => { try { return JSON.parse(sess?.event_log || '[]') } catch { return [] } }, [sess])
  const emotionTimeline = useMemo(() => { try { return JSON.parse(sess?.emotion_timeline || '[]') } catch { return [] } }, [sess])
  const cognitiveTimeline = useMemo(() => { try { return JSON.parse(sess?.cognitive_timeline || '[]') } catch { return [] } }, [sess])

  if (!data) return <div style={{ padding: 40, color: 'var(--muted)' }}>데이터 로딩 중...</div>
  if (data.error) return <div style={{ padding: 40, color: 'var(--red)' }}>{data.error}</div>
  if (!sess) return <div style={{ padding: 40, color: 'var(--muted)' }}>세션 데이터 없음</div>

  // ── Derived values from selected session ──────────────────────
  const score = sess.behavior_total
  const scoreColor = (s: number) => s >= 80 ? '#3fb950' : s >= 60 ? '#58a6ff' : s >= 40 ? '#d29922' : '#f85149'
  const mainColor = scoreColor(score)
  const level = score < 40 ? 'novice' : score < 55 ? 'beginner' : score < 70 ? 'developing' : score < 85 ? 'proficient' : 'expert'
  const allScores: number[] = data.all_scores || []
  const pct = allScores.length > 0
    ? Math.round(allScores.filter((v: number) => v < score).length / allScores.length * 100)
    : data.percentile ?? 50
  const distribution = buildDistribution(allScores, score)

  const radarData = [
    { dim: '인지부하', score: Math.round((sess.cognitive_load + sess.mental_effort) / 2), expert: 82 },
    { dim: '정서안정', score: Math.round(Math.max(0, Math.min(100, (sess.emotion_positive - sess.emotion_negative + 100) / 2))), expert: 78 },
    { dim: '행동수행', score: Math.round(sess.behavior_total), expert: 92 },
    { dim: '시선집중', score: Math.round(sess.gaze_focus_rate), expert: 88 },
    { dim: '과제완성', score: Math.round(sess.action_completion), expert: 95 },
    { dim: '최적경로', score: Math.round(sess.optimal_path_rate), expert: 90 },
  ]
  const behaviorBreakdown = [
    { name: '의사소통', score: sess.behavior_communication },
    { name: '절차수행', score: sess.behavior_procedure },
    { name: '의사결정', score: sess.behavior_decision },
    { name: '과제완성', score: sess.action_completion },
    { name: '최적경로', score: sess.optimal_path_rate },
  ]
  const gazeData = [
    { name: '과제 영역', value: sess.gaze_task_area },
    { name: '집중도',    value: sess.gaze_focus_rate },
    { name: '분산',      value: sess.gaze_distraction },
  ]

  // ── Small helpers (not hooks, safe after early returns) ────────
  const IBtn = ({ id }: { id: string }) => (
    <button onClick={() => toggleInterp(id)} style={{
      background: 'none', border: '1px solid var(--border)', borderRadius: 4,
      cursor: 'pointer', fontSize: 10, padding: '2px 8px', color: 'var(--muted)',
      transition: 'all 0.15s', lineHeight: 1.5, flexShrink: 0
    }}>
      {interp.has(id) ? '▲ 닫기' : '💡 해석'}
    </button>
  )
  const IBox = ({ id }: { id: string }) => interp.has(id) ? (
    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, padding: '10px 12px',
      background: 'var(--bg3)', borderRadius: 6, borderLeft: '3px solid var(--yellow)', lineHeight: 1.7 }}>
      💡 {INTERP[id]}
    </div>
  ) : null

  const getAiFeedback = async () => {
    setFbLoading(true)
    const res = await fetch(`/api/feedback/${pid}`, { method: 'POST' }).then(r => r.json())
    setFeedback(res); setFbLoading(false)
  }

  const uploadVideo = async (file: File) => {
    setUploadingVideo(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('participant_id', pid)
    fd.append('session_label', sess?.session_label || 'Session 1')
    await fetch('/api/video/upload', { method: 'POST', body: fd })
    const updated = await fetch(`/api/dashboard/${pid}`).then(r => r.json())
    setData(updated); setUploadingVideo(false)
  }

  const tooltipStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }

  return (
    <div>
      {/* ── Header ── */}
      <div className="dash-header">
        <div>
          <div className="dash-name">👤 {name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
            {data.sessions.length}회 세션 완료
            {data.participant?.group_name && data.participant.group_name !== 'default' && (
              <span style={{ padding: '1px 7px', background: 'var(--bg3)', borderRadius: 10,
                fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>
                {data.participant.group_name}
              </span>
            )}
          </div>
        </div>
        <div className="dash-session-row">
          {data.sessions.map((s: any, i: number) => (
            <span key={i} className={`session-badge ${selectedSession === i ? 'active' : ''}`}
              style={{ cursor: 'pointer' }} onClick={() => setSelectedSession(i)}>
              {s.session_label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
              background: activeSection === s.id ? 'var(--blue)' : 'var(--bg3)',
              color: activeSection === s.id ? '#fff' : 'var(--muted)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ 개요 ══════════════════════ */}
      {activeSection === 'overview' && (
        <>
          <div className="dash-grid">
            {/* Gauge + percentile */}
            <div className="card gauge-wrap">
              <div className="card-title">종합 수행 점수</div>
              <GaugeChart value={score} color={mainColor} />
              <PercentileBar value={pct} />
            </div>

            {/* Level + quick stats */}
            <div className="card">
              <div className="card-title">학습 단계</div>
              <LevelIndicator level={level} />
              <div style={{ marginTop: 14 }}>
                <div className="card-title">오류 & 효율</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { label: '오류', val: `${sess.error_count.toFixed(0)}회`, color: sess.error_count > 5 ? '#f85149' : '#3fb950' },
                    { label: '최적', val: `${sess.optimal_path_rate.toFixed(0)}%`, color: '#58a6ff' },
                    { label: '완성', val: `${sess.action_completion.toFixed(0)}%`, color: '#3fb950' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '8px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Radar vs expert */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>다차원 프로파일 vs 전문가</div>
                <IBtn id="radar" />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.2} name="나" dot={{ fill: '#58a6ff', r: 3 }} />
                  <Radar dataKey="expert" stroke="#3fb950" fill="#3fb950" fillOpacity={0.1} name="전문가" strokeDasharray="4 2" />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
              <IBox id="radar" />
            </div>

            {/* Distribution */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>집단 분포</div>
                <IBtn id="distribution" />
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={distribution} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" vertical={false} />
                  <XAxis dataKey="range" tick={{ fill: 'var(--muted)', fontSize: 8 }} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {distribution.map((d: any, i: number) => (
                      <Cell key={i} fill={d.isMe ? '#ffa657' : 'var(--bg3)'} stroke={d.isMe ? '#ffa657' : 'var(--border)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                <span style={{ color: '#ffa657' }}>■</span> 내 위치 (백분위 {pct}%)
              </div>
              <IBox id="distribution" />
            </div>
          </div>

          {/* Event timeline */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🗓 행동 이벤트 타임라인</div>
            <EventTimeline events={eventLog} totalTime={sess.time_total} />
          </div>
        </>
      )}

      {/* ══════════════════════ 영상 ══════════════════════ */}
      {activeSection === 'video' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🎬 시뮬레이션 영상 업로드</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              가상 공간에서 수행한 시뮬레이션 영상을 업로드하면 여기서 바로 재생하며 성찰할 수 있어요.
            </div>
            <input ref={videoRef} type="file" accept="video/*" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
            <button className="btn btn-blue" style={{ width: 'auto', padding: '8px 20px' }}
              onClick={() => videoRef.current?.click()} disabled={uploadingVideo}>
              {uploadingVideo ? '업로드 중...' : '📂 영상 파일 업로드'}
            </button>
          </div>

          {(!data.videos || data.videos.length === 0) && (
            <div className="empty-state" style={{ padding: '40px 24px' }}>
              <div className="empty-icon">🎬</div>
              <div className="empty-title">업로드된 영상이 없어요</div>
              <div className="empty-sub">위 버튼으로 시뮬레이션 영상을 업로드해보세요</div>
            </div>
          )}

          {data.videos?.map((v: any, i: number) => (
            <div className="card" key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{v.original_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {v.session_label} · {String(v.created_at ?? '').split('T')[0]}
                  </div>
                </div>
              </div>
              <video controls style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 480 }}
                src={`/api/video/stream/${v.filename}`} />
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 6,
                fontSize: 12, color: 'var(--muted)', borderLeft: '3px solid var(--blue)' }}>
                💡 영상을 보면서 질문해보세요: 어떤 순간에 망설였나요? 더 빠른 결정을 내릴 수 있었던 순간은?
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════ 행동 ══════════════════════ */}
      {activeSection === 'behavior' && (
        <>
          <div className="dash-grid-2">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>행동 영역별 점수</div>
                <IBtn id="behaviorBar" />
              </div>
              <ScoreBar label="의사소통" score={sess.behavior_communication} color="#58a6ff" />
              <ScoreBar label="절차수행" score={sess.behavior_procedure} color="#3fb950" />
              <ScoreBar label="의사결정" score={sess.behavior_decision} color="#bc8cff" />
              <ScoreBar label="과제완성" score={sess.action_completion} color="#ffa657" />
              <ScoreBar label="최적경로" score={sess.optimal_path_rate} color="#39d353" />
              <IBox id="behaviorBar" />
            </div>
            <div className="card">
              <div className="card-title">행동 점수 비교 (전문가 기준)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={behaviorBreakdown} layout="vertical" barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} width={64} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="score" name="내 점수" fill="#58a6ff" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>이벤트 유형별 빈도</div>
              <IBtn id="eventFreq" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={Object.entries(EVENT_COLORS).map(([type, color]) => ({
                name: type === 'correct' ? '정상수행' : type === 'optimal' ? '최적수행' : type === 'error' ? '오류' : '경고',
                count: eventLog.filter((e: any) => e.type === type).length,
                color,
              }))} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {['correct', 'optimal', 'error', 'warning'].map((t, i) => <Cell key={i} fill={EVENT_COLORS[t]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <IBox id="eventFreq" />
          </div>

          <div className="card">
            <div className="card-title">🗓 행동 이벤트 타임라인</div>
            <EventTimeline events={eventLog} totalTime={sess.time_total} />
          </div>
        </>
      )}

      {/* ══════════════════════ 인지·정서 ══════════════════════ */}
      {activeSection === 'cognition' && (
        <>
          <div className="dash-grid-2">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>인지 상태 변화</div>
                <IBtn id="cognitive" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cognitiveTimeline}>
                  <defs>
                    <linearGradient id="clg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d29922" stopOpacity={0.3} /><stop offset="95%" stopColor="#d29922" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="meg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffa657" stopOpacity={0.3} /><stop offset="95%" stopColor="#ffa657" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={v => `${v}s`} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={v => `${v}초`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="cognitive_load" stroke="#d29922" fill="url(#clg)" name="인지부하" />
                  <Area type="monotone" dataKey="mental_effort" stroke="#ffa657" fill="url(#meg)" name="정신적 노력" />
                </AreaChart>
              </ResponsiveContainer>
              <IBox id="cognitive" />
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>정서 변화</div>
                <IBtn id="emotion" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={emotionTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={v => `${v}s`} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={v => `${v}초`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="valence" stroke="#3fb950" strokeWidth={2} dot={false} name="긍정정서" />
                  <Line type="monotone" dataKey="stress" stroke="#f85149" strokeWidth={2} dot={false} name="스트레스" />
                  <Line type="monotone" dataKey="arousal" stroke="#bc8cff" strokeWidth={2} dot={false} name="각성수준" strokeDasharray="4 2" />
                  <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
              <IBox id="emotion" />
            </div>
          </div>

          <div className="card">
            <div className="card-title">인지·정서 요약 지표</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
              {[
                { label: '인지부하', val: sess.cognitive_load, color: '#d29922' },
                { label: '정신노력', val: sess.mental_effort,  color: '#ffa657' },
                { label: '긍정정서', val: sess.emotion_positive, color: '#3fb950' },
                { label: '부정정서', val: sess.emotion_negative, color: '#f85149' },
                { label: '각성수준', val: sess.arousal,         color: '#bc8cff' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
                  <GaugeChart value={item.val} color={item.color} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════ 시선 ══════════════════════ */}
      {activeSection === 'gaze' && (
        <>
          <div className="dash-grid-3">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>시선 분포</div>
                <IBtn id="gaze" />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={gazeData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                    {gazeData.map((_: any, i: number) => <Cell key={i} fill={GAZE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
              {gazeData.map((g: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: GAZE_COLORS[i] }}>■ {g.name}</span>
                  <span style={{ fontWeight: 600 }}>{g.value.toFixed(1)}%</span>
                </div>
              ))}
              <IBox id="gaze" />
            </div>
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <div className="card-title">시선 집중도 해석</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { label: '과제 영역 시선 비율', val: sess.gaze_task_area, threshold: 70, desc: '과제 관련 영역을 얼마나 집중해서 봤는지' },
                  { label: '전체 집중도', val: sess.gaze_focus_rate, threshold: 65, desc: '시선이 분산되지 않고 집중된 정도' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: item.val >= item.threshold ? '#3fb950' : '#d29922', marginBottom: 4 }}>
                      {item.val.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.desc}</div>
                    <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, marginTop: 6 }}>
                      <div style={{ height: '100%', width: `${item.val}%`,
                        background: item.val >= item.threshold ? '#3fb950' : '#d29922', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 12px', background: 'var(--bg3)',
                borderRadius: 6, borderLeft: '3px solid var(--blue)' }}>
                💡 과제 영역 시선 비율이 높을수록 핵심 정보에 집중했음을 의미해요. 집중도가 낮다면 환경 자극에 주의가 분산되었을 가능성이 있어요.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">시간 활용 분석</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              {[
                { label: '총 소요 시간', val: `${Math.floor(sess.time_total / 60)}분 ${(sess.time_total % 60).toFixed(0)}초`, color: '#58a6ff' },
                { label: '과제 집중 시간', val: `${sess.time_on_task.toFixed(0)}초`, color: '#3fb950' },
                { label: '유휴 시간',     val: `${sess.time_idle.toFixed(0)}초`,     color: '#f85149' },
                { label: '집중 비율',     val: `${(sess.time_on_task / sess.time_total * 100).toFixed(0)}%`, color: '#bc8cff' },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.val}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════ 추이 ══════════════════════ */}
      {activeSection === 'trend' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>세션별 수행 변화</div>
              <IBtn id="trend" />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" />
                <XAxis dataKey="session" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="score" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.15} name="행동 점수" />
                <Line yAxisId="left" type="monotone" dataKey="completion" stroke="#3fb950" strokeWidth={2} dot={{ r: 4 }} name="과제완성률" strokeDasharray="4 2" />
                <Bar yAxisId="right" dataKey="error" fill="#f85149" fillOpacity={0.5} name="오류 횟수" barSize={20} />
              </ComposedChart>
            </ResponsiveContainer>
            <IBox id="trend" />
          </div>
          <div className="card">
            <div className="card-title">성장 요약</div>
            {data.trend.length >= 2 && (() => {
              const first = data.trend[0], last = data.trend[data.trend.length - 1]
              const diff = last.score - first.score
              const errDiff = (last.error || 0) - (first.error || 0)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: '점수 변화', val: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}점`, color: diff >= 0 ? '#3fb950' : '#f85149' },
                    { label: '완성률 변화', val: `${(last.completion - first.completion) >= 0 ? '+' : ''}${(last.completion - first.completion).toFixed(1)}%`, color: (last.completion - first.completion) >= 0 ? '#3fb950' : '#f85149' },
                    { label: '오류 변화', val: `${errDiff > 0 ? '+' : ''}${errDiff.toFixed(0)}회`, color: errDiff <= 0 ? '#3fb950' : '#f85149' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ══════════════════════ AI 피드백 ══════════════════════ */}
      {activeSection === 'feedback' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🤖 AI 성찰 피드백</div>
            <button className="btn btn-blue" style={{ width: 'auto', padding: '6px 18px' }}
              onClick={getAiFeedback} disabled={fbLoading}>
              {fbLoading ? '분석 중...' : feedback ? '재분석' : 'AI 피드백 받기'}
            </button>
          </div>

          {!feedback && !fbLoading && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
              수행 데이터를 분석해 맞춤형 성찰 피드백과 성찰 질문을 제공해요
            </div>
          )}
          {fbLoading && <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Claude가 분석 중...</div>}

          {feedback && !fbLoading && (
            <>
              <div className="fb-overall" style={{ marginBottom: 16 }}>{feedback.overall}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="fb-section">
                  <div className="fb-label" style={{ color: '#3fb950' }}>✅ 잘한 점</div>
                  {feedback.strengths?.map((s: string, i: number) => <div key={i} className="fb-item">• {s}</div>)}
                </div>
                <div className="fb-section">
                  <div className="fb-label" style={{ color: '#f85149' }}>⚠️ 개선 필요</div>
                  {feedback.improvements?.map((s: string, i: number) => <div key={i} className="fb-item">• {s}</div>)}
                </div>
                <div className="fb-section">
                  <div className="fb-label" style={{ color: '#58a6ff' }}>🎯 다음 단계</div>
                  {feedback.next_steps?.map((s: string, i: number) => <div key={i} className="fb-item">• {s}</div>)}
                </div>
              </div>
              {feedback.reflection_questions?.length > 0 && (
                <div>
                  <div className="fb-label" style={{ color: '#bc8cff', marginBottom: 8 }}>💬 성찰 질문</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.reflection_questions.map((q: string, i: number) => (
                      <div key={i} style={{ padding: '12px 14px', background: 'var(--bg3)', borderRadius: 8,
                        borderLeft: '3px solid #bc8cff', fontSize: 13, lineHeight: 1.6 }}>
                        Q{i + 1}. {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
