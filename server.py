from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import anthropic, json, os, csv, io, sqlite3, math
from pathlib import Path

BASE_DIR = Path(__file__).parent
env_path = BASE_DIR / '.env'
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

app = Flask(__name__, static_folder=str(BASE_DIR / 'dist'), static_url_path='')
app.config['JSON_AS_ASCII'] = False
CORS(app)
client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

DB = BASE_DIR / 'dashboard.db'

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS participants (
            id TEXT PRIMARY KEY,
            name TEXT,
            group_name TEXT DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            participant_id TEXT,
            session_label TEXT,
            behavior_total REAL, behavior_communication REAL,
            behavior_procedure REAL, behavior_decision REAL,
            time_total REAL, time_on_task REAL, time_idle REAL,
            gaze_focus_rate REAL, gaze_task_area REAL, gaze_distraction REAL,
            cognitive_load REAL, mental_effort REAL,
            emotion_positive REAL, emotion_negative REAL, arousal REAL,
            action_completion REAL, error_count REAL, optimal_path_rate REAL,
            raw_log TEXT DEFAULT '[]',
            event_log TEXT DEFAULT '[]',
            emotion_timeline TEXT DEFAULT '[]',
            cognitive_timeline TEXT DEFAULT '[]',
            video_path TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            participant_id TEXT,
            session_label TEXT,
            filename TEXT,
            original_name TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        """)

init_db()

def resp(data, status=200):
    return Response(json.dumps(data, ensure_ascii=False),
                    status=status, content_type='application/json; charset=utf-8')

# ── Participants ────────────────────────────────────────────────
@app.route('/api/participants', methods=['GET'])
def get_participants():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM participants ORDER BY created_at DESC").fetchall()
    return resp([dict(r) for r in rows])

@app.route('/api/participants', methods=['POST'])
def add_participant():
    d = request.json
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO participants (id, name, group_name) VALUES (?,?,?)",
                     (d['id'], d.get('name', d['id']), d.get('group_name', 'default')))
        conn.commit()
    return resp({'ok': True})

# ── Video Upload ────────────────────────────────────────────────
VIDEOS_DIR = BASE_DIR / 'videos'
VIDEOS_DIR.mkdir(exist_ok=True)

@app.route('/api/video/upload', methods=['POST'])
def upload_video():
    file = request.files.get('file')
    pid = request.form.get('participant_id', '')
    session_label = request.form.get('session_label', 'Session 1')
    if not file or not pid:
        return resp({'error': '파일 또는 참여자 ID 없음'}, 400)
    import uuid
    ext = Path(file.filename).suffix
    fname = f'{pid}_{session_label}_{uuid.uuid4().hex[:8]}{ext}'
    save_path = VIDEOS_DIR / fname
    file.save(save_path)
    with get_db() as conn:
        conn.execute("INSERT INTO videos (participant_id, session_label, filename, original_name) VALUES (?,?,?,?)",
                     (pid, session_label, fname, file.filename))
        conn.commit()
    return resp({'ok': True, 'filename': fname})

@app.route('/api/video/<pid>', methods=['GET'])
def get_videos(pid):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM videos WHERE participant_id=? ORDER BY created_at DESC", (pid,)).fetchall()
    return resp([dict(r) for r in rows])

@app.route('/api/video/stream/<filename>')
def stream_video(filename):
    return send_from_directory(str(VIDEOS_DIR), filename)

# ── CSV Upload ──────────────────────────────────────────────────
@app.route('/api/upload', methods=['POST'])
def upload_csv():
    file = request.files.get('file')
    if not file:
        return resp({'error': '파일 없음'}, 400)
    content = file.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(content))
    inserted = 0
    with get_db() as conn:
        for row in reader:
            pid = row.get('participant_id', '').strip()
            if not pid:
                continue
            conn.execute("INSERT OR IGNORE INTO participants (id, name) VALUES (?,?)", (pid, pid))
            conn.execute("""INSERT INTO sessions
                (participant_id, session_label,
                 behavior_total, behavior_communication, behavior_procedure, behavior_decision,
                 time_total, time_on_task, time_idle,
                 gaze_focus_rate, gaze_task_area, gaze_distraction,
                 cognitive_load, mental_effort,
                 emotion_positive, emotion_negative, arousal,
                 action_completion, error_count, optimal_path_rate, raw_log)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (pid, row.get('session_id', '1'),
                 _f(row,'behavior_total'), _f(row,'behavior_communication'),
                 _f(row,'behavior_procedure'), _f(row,'behavior_decision'),
                 _f(row,'time_total'), _f(row,'time_on_task'), _f(row,'time_idle'),
                 _f(row,'gaze_focus_rate'), _f(row,'gaze_task_area'), _f(row,'gaze_distraction'),
                 _f(row,'cognitive_load'), _f(row,'mental_effort'),
                 _f(row,'emotion_positive'), _f(row,'emotion_negative'), _f(row,'arousal'),
                 _f(row,'action_completion'), _f(row,'error_count'), _f(row,'optimal_path_rate'),
                 row.get('raw_log', '[]')))
            inserted += 1
        conn.commit()
    return resp({'inserted': inserted})

def _f(row, key):
    try: return float(row.get(key) or 0)
    except: return 0.0

# ── Dashboard data ──────────────────────────────────────────────
@app.route('/api/dashboard/<pid>')
def dashboard(pid):
    with get_db() as conn:
        participant = conn.execute("SELECT * FROM participants WHERE id=?", (pid,)).fetchone()
        sessions = conn.execute(
            "SELECT * FROM sessions WHERE participant_id=? ORDER BY created_at", (pid,)).fetchall()
        all_sessions = conn.execute("SELECT * FROM sessions").fetchall()

    if not participant:
        return resp({'error': '참여자 없음'}, 404)

    sessions = [dict(s) for s in sessions]
    all_sessions = [dict(s) for s in all_sessions]

    if not sessions:
        return resp({'error': '세션 데이터 없음'}, 404)

    latest = sessions[-1]

    # Percentile calculation
    def percentile(field, val):
        vals = [s[field] for s in all_sessions if s[field] is not None]
        if not vals: return 50
        below = sum(1 for v in vals if v < val)
        return round(below / len(vals) * 100)

    # Group distribution for histogram
    def distribution(field):
        vals = [s[field] for s in all_sessions if s[field] is not None]
        if not vals: return []
        mn, mx = min(vals), max(vals)
        if mx == mn: return [{'range': f'{mn:.0f}', 'count': len(vals), 'isMe': True}]
        step = (mx - mn) / 8
        bins = []
        for i in range(8):
            lo, hi = mn + i * step, mn + (i+1) * step
            count = sum(1 for v in vals if lo <= v < hi)
            bins.append({
                'range': f'{lo:.0f}-{hi:.0f}',
                'count': count,
                'isMe': lo <= latest[field] < hi
            })
        return bins

    score = latest['behavior_total']
    pct = percentile('behavior_total', score)

    # Learning level (novice→expert)
    level = 'novice' if score < 40 else 'beginner' if score < 55 else 'developing' if score < 70 else 'proficient' if score < 85 else 'expert'

    # Expert benchmark
    expert = {'dim': '인지', 'cognitive': 82, 'emotion': 78, 'behavior': 92,
              'gaze': 88, 'completion': 95, 'optimal': 90}

    # Videos
    with get_db() as conn:
        videos = conn.execute("SELECT * FROM videos WHERE participant_id=? ORDER BY created_at DESC", (pid,)).fetchall()

    all_behavior_scores = [s['behavior_total'] for s in all_sessions if s['behavior_total'] is not None]

    return resp({
        'participant': dict(participant),
        'latest': latest,
        'sessions': sessions,
        'percentile': pct,
        'level': level,
        'all_scores': all_behavior_scores,
        'distribution': distribution('behavior_total'),
        'radar': [
            {'dim': '인지부하', 'score': round((latest['cognitive_load']+latest['mental_effort'])/2,1), 'expert': 82},
            {'dim': '정서안정', 'score': round((latest['emotion_positive']-latest['emotion_negative']+100)/2,1), 'expert': 78},
            {'dim': '행동수행', 'score': round(latest['behavior_total'],1), 'expert': 92},
            {'dim': '시선집중', 'score': round(latest['gaze_focus_rate'],1), 'expert': 88},
            {'dim': '과제완성', 'score': round(latest['action_completion'],1), 'expert': 95},
            {'dim': '최적경로', 'score': round(latest['optimal_path_rate'],1), 'expert': 90},
        ],
        'behavior_breakdown': [
            {'name': '의사소통', 'score': latest['behavior_communication'], 'full': 100},
            {'name': '절차수행', 'score': latest['behavior_procedure'], 'full': 100},
            {'name': '의사결정', 'score': latest['behavior_decision'], 'full': 100},
            {'name': '과제완성', 'score': latest['action_completion'], 'full': 100},
            {'name': '최적경로', 'score': latest['optimal_path_rate'], 'full': 100},
        ],
        'gaze_data': [
            {'name': '과제 영역', 'value': latest['gaze_task_area']},
            {'name': '집중도', 'value': latest['gaze_focus_rate']},
            {'name': '분산', 'value': latest['gaze_distraction']},
        ],
        'time_data': [
            {'name': '과제 수행', 'value': latest['time_on_task']},
            {'name': '유휴 시간', 'value': latest['time_idle']},
        ],
        'trend': [{'session': s['session_label'], 'score': s['behavior_total'],
                   'completion': s['action_completion'],
                   'error': s['error_count']} for s in sessions],
        'event_log': json.loads(latest.get('event_log') or '[]'),
        'emotion_timeline': json.loads(latest.get('emotion_timeline') or '[]'),
        'cognitive_timeline': json.loads(latest.get('cognitive_timeline') or '[]'),
        'videos': [dict(v) for v in videos],
    })

# ── AI Feedback ─────────────────────────────────────────────────
@app.route('/api/feedback/<pid>', methods=['POST'])
def ai_feedback(pid):
    with get_db() as conn:
        sessions = conn.execute(
            "SELECT * FROM sessions WHERE participant_id=? ORDER BY created_at", (pid,)).fetchall()
        all_sessions = conn.execute("SELECT behavior_total FROM sessions").fetchall()
    if not sessions:
        return resp({'error': '데이터 없음'}, 404)

    latest = dict(sessions[-1])
    all_scores = [s['behavior_total'] for s in all_sessions]
    avg = sum(all_scores) / len(all_scores) if all_scores else 50
    pct = sum(1 for v in all_scores if v < latest['behavior_total']) / len(all_scores) * 100 if all_scores else 50

    prompt = f"""XR 시뮬레이션 학습자의 수행 데이터를 분석하고 성찰적 피드백을 제공하세요.

[수행 데이터]
- 행동 총점: {latest['behavior_total']:.1f}/100 (집단 평균: {avg:.1f}, 백분위: {pct:.0f}%)
- 의사소통: {latest['behavior_communication']:.1f} / 절차수행: {latest['behavior_procedure']:.1f} / 의사결정: {latest['behavior_decision']:.1f}
- 과제완성률: {latest['action_completion']:.1f}% / 오류횟수: {latest['error_count']:.0f}회 / 최적경로: {latest['optimal_path_rate']:.1f}%
- 시선집중도: {latest['gaze_focus_rate']:.1f}% / 과제영역시선: {latest['gaze_task_area']:.1f}%
- 인지부하: {latest['cognitive_load']:.1f} / 정신적 노력: {latest['mental_effort']:.1f}
- 긍정정서: {latest['emotion_positive']:.1f} / 부정정서: {latest['emotion_negative']:.1f}
- 총 소요시간: {latest['time_total']:.0f}초 / 과제시간: {latest['time_on_task']:.0f}초

다음 JSON 형식으로 응답하세요:
{{
  "strengths": ["잘한 점 2-3가지"],
  "improvements": ["개선할 점 2-3가지"],
  "next_steps": ["다음 단계를 위한 구체적 행동 2-3가지"],
  "reflection_questions": ["성찰을 유도하는 질문 3가지 (본인 경험을 돌아보게 하는)"],
  "overall": "전체적인 성찰 메시지 (2-3문장, 격려적 톤으로)"
}}"""

    try:
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001', max_tokens=800,
            messages=[{"role": "user", "content": prompt}])
        text = msg.content[0].text.strip()
        if '```' in text: text = text.split('```')[1].split('```')[0].replace('json','').strip()
        return resp(json.loads(text))
    except Exception as e:
        return resp({'error': str(e)}, 500)

# ── Sample data ─────────────────────────────────────────────────
ACTION_TYPES = [
    ('환자 접근', 'correct'), ('기구 준비', 'correct'), ('청진기 사용', 'optimal'),
    ('활력징후 측정', 'correct'), ('약품 선택', 'correct'), ('잘못된 약품 선택', 'error'),
    ('의사소통 시도', 'correct'), ('절차 건너뜀', 'error'), ('최적 경로 수행', 'optimal'),
    ('보조 기구 사용', 'correct'), ('재시도', 'warning'), ('기록 작성', 'correct'),
    ('팀원 협력', 'optimal'), ('비효율 동작', 'warning'), ('최종 처치', 'correct'),
]

def make_event_log(total_time, error_count, base_score, rng):
    events = []
    n = rng.randint(8, 18)
    times = sorted(rng.uniform(0, total_time) for _ in range(n))
    for t in times:
        idx = rng.randint(0, len(ACTION_TYPES) - 1)
        name, typ = ACTION_TYPES[idx]
        if typ == 'error' and error_count <= 0:
            typ = 'warning'
        events.append({'time': round(t, 1), 'action': name, 'type': typ,
                        'score': 2 if typ=='optimal' else 1 if typ=='correct' else -1 if typ=='error' else 0})
    return events

def make_emotion_timeline(total_time, pos, neg, rng):
    pts = []
    steps = 12
    for i in range(steps+1):
        t = total_time * i / steps
        noise = rng.gauss(0, 5)
        pts.append({'time': round(t,1),
                    'valence': round(max(0,min(100, pos + noise + rng.gauss(0,3))),1),
                    'arousal': round(max(0,min(100, 60 + noise)),1),
                    'stress': round(max(0,min(100, neg + rng.gauss(0,4))),1)})
    return pts

def make_cognitive_timeline(total_time, cl, me, rng):
    pts = []
    steps = 12
    for i in range(steps+1):
        t = total_time * i / steps
        peak = 1 + 0.4 * abs(math.sin(i * 0.5))
        pts.append({'time': round(t,1),
                    'cognitive_load': round(max(0,min(100, cl * peak + rng.gauss(0,5))),1),
                    'mental_effort': round(max(0,min(100, me * peak + rng.gauss(0,5))),1)})
    return pts

@app.route('/api/sample', methods=['POST'])
def load_sample():
    import random, math
    rng = random.Random(42)

    # (group_name, base_min, base_max, growth_min, growth_max, noise)
    TYPES = [
        ('점차향상',  35, 50,  13, 17, 5),   # 낮은 시작 → 큰 성장
        ('계속우수',  80, 90,   0,  3, 4),   # 높은 시작 → 유지
        ('계속낮음',  18, 32,   0,  2, 4),   # 낮은 시작 → 소폭
        ('안정향상',  55, 65,   3,  5, 4),   # 중간 → 소폭 성장
        ('하락경향',  75, 85, -14,-10, 4),   # 높은 시작 → 하락
    ]

    with get_db() as conn:
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM participants")
        conn.execute("DELETE FROM videos")
        pid_num = 1
        for (group, bmin, bmax, gmin, gmax, noise) in TYPES:
            for _ in range(4):
                pid = f'P{pid_num:03d}'
                name = f'참여자{pid_num:02d}'
                conn.execute("INSERT INTO participants (id, name, group_name) VALUES (?,?,?)",
                             (pid, name, group))
                base = rng.uniform(bmin, bmax)
                for s in range(1, 4):
                    growth = (s - 1) * rng.uniform(gmin, gmax)
                    b_total = max(5, min(98, base + growth + rng.gauss(0, noise)))
                    t_total = rng.uniform(600, 1800)
                    err = max(0, rng.uniform(0, 8) * (1.5 if b_total < 50 else 0.6))
                    ep = max(20, min(90, 35 + b_total * 0.55 + rng.gauss(0, 5)))
                    en = max(5,  min(60, 65 - b_total * 0.45 + rng.gauss(0, 5)))
                    cl = rng.uniform(30, 80)
                    me = rng.uniform(30, 80)
                    event_log   = make_event_log(t_total, err, b_total, rng)
                    emotion_tl  = make_emotion_timeline(t_total, ep, en, rng)
                    cognitive_tl = make_cognitive_timeline(t_total, cl, me, rng)
                    conn.execute("""INSERT INTO sessions
                        (participant_id, session_label,
                         behavior_total, behavior_communication, behavior_procedure, behavior_decision,
                         time_total, time_on_task, time_idle,
                         gaze_focus_rate, gaze_task_area, gaze_distraction,
                         cognitive_load, mental_effort,
                         emotion_positive, emotion_negative, arousal,
                         action_completion, error_count, optimal_path_rate,
                         event_log, emotion_timeline, cognitive_timeline)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (pid, f'Session {s}',
                         round(b_total, 1),
                         round(max(0, min(100, b_total + rng.gauss(0, 8))), 1),
                         round(max(0, min(100, b_total + rng.gauss(0, 8))), 1),
                         round(max(0, min(100, b_total + rng.gauss(0, 8))), 1),
                         round(t_total, 0), round(rng.uniform(400, 1400), 0), round(rng.uniform(50, 300), 0),
                         round(rng.uniform(50, 90), 1), round(rng.uniform(55, 85), 1), round(rng.uniform(5, 30), 1),
                         round(cl, 1), round(me, 1), round(ep, 1), round(en, 1), round(rng.uniform(40, 80), 1),
                         round(rng.uniform(50, 95), 1), round(err, 0), round(rng.uniform(40, 90), 1),
                         json.dumps(event_log), json.dumps(emotion_tl), json.dumps(cognitive_tl)))
                pid_num += 1
        conn.commit()
    return resp({'ok': True, 'participants': 20})

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    dist = str(BASE_DIR / 'dist')
    if path and os.path.exists(os.path.join(dist, path)):
        return send_from_directory(dist, path)
    return send_from_directory(dist, 'index.html')

if __name__ == '__main__':
    print('✅ XR Dashboard → http://localhost:5004')
    app.run(debug=False, port=5004)
