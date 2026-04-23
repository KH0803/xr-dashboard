import { useState, useEffect, useRef } from 'react'
import Dashboard from './components/Dashboard'

interface Participant { id: string; name: string }

export default function App() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [light, setLight] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadParticipants = () =>
    fetch('/api/participants').then(r => r.json()).then(setParticipants)

  useEffect(() => { loadParticipants() }, [])

  const loadSample = async () => {
    setLoading(true)
    await fetch('/api/sample', { method: 'POST' })
    await loadParticipants()
    setLoading(false)
  }

  const uploadCSV = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    setLoading(true)
    const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json())
    setLoading(false)
    if (res.inserted > 0) { await loadParticipants(); alert(`${res.inserted}개 세션 업로드 완료`) }
  }

  return (
    <div className={`layout ${light ? 'light' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="sidebar-title">🥽 XR Learning Dashboard</div>
              <div className="sidebar-sub">학습 성찰 시스템</div>
            </div>
            <button onClick={() => setLight(v => !v)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                       cursor: 'pointer', fontSize: 15, padding: '3px 6px', color: 'var(--muted)',
                       transition: 'all 0.15s', lineHeight: 1 }}
              title={light ? '다크 모드' : '라이트 모드'}>
              {light ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
        <div className="p-list">
          {participants.length === 0 && (
            <div style={{ padding: '20px 8px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
              참여자 없음<br/>샘플 데이터를 불러오세요
            </div>
          )}
          {participants.map(p => (
            <div key={p.id} className={`p-item ${selected === p.id ? 'active' : ''}`}
              onClick={() => setSelected(p.id)}>
              👤 {p.name}
            </div>
          ))}
        </div>
        <div className="sidebar-actions">
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && uploadCSV(e.target.files[0])} />
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            📂 CSV 업로드
          </button>
          <button className="btn btn-blue" onClick={loadSample} disabled={loading}>
            {loading ? '로딩...' : '🎲 샘플 데이터'}
          </button>
        </div>
      </aside>
      <main className="main">
        {selected
          ? <Dashboard pid={selected} name={participants.find(p => p.id === selected)?.name || selected} />
          : <div className="empty-state">
              <div className="empty-icon">🥽</div>
              <div className="empty-title">XR 시뮬레이션 학습 성찰 대시보드</div>
              <div className="empty-sub">
                왼쪽에서 참여자를 선택하거나<br/>
                샘플 데이터를 불러와 대시보드를 확인하세요
              </div>
            </div>
        }
      </main>
    </div>
  )
}
