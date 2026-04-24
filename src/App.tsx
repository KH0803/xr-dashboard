import { useState, useEffect, useRef } from 'react'
import Dashboard from './components/Dashboard'
import { store } from './lib/store'
import { importCSV } from './lib/store'
import { generateSampleData } from './lib/sampleData'

interface Participant { id: string; name: string; group_name: string }

export default function App() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selected, setSelected]         = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  const [light, setLight]               = useState(true)
  const [apiKey, setApiKey]             = useState(store.getApiKey())
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = () => setParticipants(store.getParticipants())
  useEffect(() => { reload() }, [])

  const loadSample = () => {
    setLoading(true)
    generateSampleData()
    reload()
    setLoading(false)
  }

  const uploadCSV = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const n = importCSV(text)
      reload()
      if (n > 0) alert(`${n}개 세션 업로드 완료`)
      else alert('데이터를 찾을 수 없어요. participant_id 컬럼이 있는지 확인해주세요.')
    }
    reader.readAsText(file, 'utf-8')
  }

  const saveKey = () => {
    store.saveApiKey(keyDraft.trim())
    setApiKey(keyDraft.trim())
    setShowKeyInput(false)
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
              참여자 없음<br />샘플 데이터를 불러오세요
            </div>
          )}
          {participants.map(p => (
            <div key={p.id} className={`p-item ${selected === p.id ? 'active' : ''}`}
              onClick={() => setSelected(p.id)}>
              <div style={{ fontSize: 13 }}>👤 {p.name}</div>
              {p.group_name && p.group_name !== 'default' && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{p.group_name}</div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-actions">
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && uploadCSV(e.target.files[0])} />
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>📂 CSV 업로드</button>
          <button className="btn btn-blue" onClick={loadSample} disabled={loading}>
            {loading ? '로딩...' : '🎲 샘플 데이터'}
          </button>

          {/* API Key */}
          <button className="btn btn-ghost" onClick={() => { setKeyDraft(apiKey); setShowKeyInput(v => !v) }}
            style={{ fontSize: 11 }}>
            {apiKey ? '🔑 API키 변경' : '🔑 API키 설정'}
          </button>
          {showKeyInput && (
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)}
                placeholder="sk-ant-..." type="password"
                style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--text)', fontSize: 11 }} />
              <button onClick={saveKey}
                style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--blue)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 11 }}>저장</button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {selected
          ? <Dashboard
              pid={selected}
              name={participants.find(p => p.id === selected)?.name || selected}
              apiKey={apiKey}
            />
          : <div className="empty-state">
              <div className="empty-icon">🥽</div>
              <div className="empty-title">XR 시뮬레이션 학습 성찰 대시보드</div>
              <div className="empty-sub">
                왼쪽에서 참여자를 선택하거나<br />
                샘플 데이터를 불러와 대시보드를 확인하세요
              </div>
            </div>
        }
      </main>
    </div>
  )
}
