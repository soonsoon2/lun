# Lun Design System v1.0

다섯 차례의 이미지 검토를 통해 수렴된 디자인 원칙. 모든 UI 구현의 기준.

---

## 1. 디자인 철학

**"Premium developer tool, not a chat app."**

- 참조: Linear, Stripe Dashboard, Vercel, Raycast
- 피해야 할 것: 카톡/디스코드/Slack 같은 일반 채팅 UI
- 핵심: 데이터 밀도와 우아함의 균형

---

## 2. 색상 시스템

### 베이스 (다크 모드 전용)
```
--bg-base:       #0a0a0f   /* 가장 깊은 배경 */
--bg-elevated:   #14141a   /* 카드/패널 */
--bg-overlay:    #1c1c24   /* 호버/액티브 */
--bg-input:      #18181f   /* 입력 영역 */
--border-subtle: #1f1f28   /* 구분선 */
--border:        #2a2a35   /* 카드 테두리 */
--border-strong: #3a3a48   /* 강조 테두리 */
```

### 텍스트
```
--text-primary:   #fafafa   /* 본문 */
--text-secondary: #a1a1aa   /* 메타 정보 */
--text-muted:     #52525b   /* 비활성 */
--text-disabled:  #3f3f46   /* 매우 비활성 */
```

### 에이전트 액센트 (각자 1색만)
```
--kiro:    #a78bfa   /* violet */
--claude:  #f59e0b   /* amber */
--copilot: #4ade80   /* mint */
--gemini:  #60a5fa   /* sky */
--codex:   #fb7185   /* rose */
--cline:   #fbbf24   /* yellow */
--pm:      #4ade80   /* mint (default PM color) */
```

### 의미 색상
```
--success:  #4ade80   /* 합의, 완료 */
--warning:  #f59e0b   /* 갈등, 주의 */
--error:    #ef4444   /* 실패 */
--info:     #60a5fa   /* 정보 */
```

---

## 3. 타이포그래피

### 폰트 페어링
- **본문/UI**: Inter, Pretendard (sans-serif)
- **데이터/식별자**: JetBrains Mono (monospace)

### 모노스페이스 사용 규칙 (엄격하게)
모노스페이스는 **데이터에만**:
- ✓ Agent 식별자: `kiro/auto`, `claude/sonnet`
- ✓ 모델명: `gpt-5.5`, `gemini-2.5-flash`
- ✓ 시간: `1.2s`, `4.2s`
- ✓ 토큰: `340tk`, `4.4k`
- ✓ 비용: `$0.012`
- ✓ 명령어: `npm install -g lun`
- ✓ 코드 블록

본문(sans-serif):
- ✗ Agent 응답 텍스트
- ✗ UI 라벨 (버튼, 메뉴)
- ✗ 일반 메타 설명

### 사이즈 스케일
```
text-xs:   11px / line-height 1.5
text-sm:   12px / 1.6
text-base: 14px / 1.65
text-md:   15px / 1.6
text-lg:   18px / 1.4
text-xl:   24px / 1.3
text-2xl:  32px / 1.2
text-hero: 48px / 1.1   /* hero 전용 */
```

---

## 4. 간격 시스템

```
space-1: 4px
space-2: 8px
space-3: 12px
space-4: 16px
space-5: 20px
space-6: 24px
space-8: 32px
space-10: 40px
space-12: 48px
```

규칙: 4의 배수만. 5px, 7px 같은 임의 값 금지.

---

## 5. 둥근 모서리

```
radius-sm: 4px    /* 칩, 작은 버튼 */
radius-md: 6px    /* 입력, 일반 버튼 */
radius-lg: 8px    /* 카드 */
radius-xl: 12px   /* 큰 패널, 모달 */
```

**16px 이상 금지** (너무 둥글면 dev tool 느낌 안 남)

---

## 6. 테두리 / 그림자

### 테두리
- 모든 카드: `1px solid var(--border)`
- 액티브: `1px solid agent-color`
- 호버: `1px solid var(--border-strong)`

### 그림자 (최소화)
```
shadow-sm: 0 1px 2px rgba(0,0,0,0.3)        /* 미세한 깊이 */
shadow-md: 0 4px 12px rgba(0,0,0,0.4)       /* 떠있는 요소 */
shadow-glow: 0 0 0 1px agent-color          /* 액세스 표시 */
```

**큰 그림자, 다중 그림자 금지.** 평면적이면서 정확.

---

## 7. 컴포넌트 패턴

### Agent Tag (모노스페이스)
```html
<span class="agent-tag" style="color: var(--kiro)">
  kiro/auto
</span>
```
- 항상 모노스페이스
- 형식: `agent_id` 또는 `agent_id/model`
- 색상: 에이전트 액센트

### Avatar
- **사용 안 함** (실제 채팅 UI에서)
- 대신 모노스페이스 prefix 사용: `kiro >`, `claude >`
- **Hero/Onboarding에서만** 글래스모피즘 캐릭터 사용

### Message
```html
<div class="message">
  <div class="msg-header">
    <span class="agent-tag" style="color: var(--kiro)">kiro/auto</span>
  </div>
  <div class="msg-body">
    응답 본문 (sans-serif)
  </div>
  <div class="msg-meta">
    sonnet · 1.2s · 340tk
  </div>
</div>
```

세 부분: **header**(누가) → **body**(무엇을) → **meta**(어떻게)

### Card
```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.card.active {
  border-color: var(--accent);
}
```

### Input (Command Palette Style)
```html
<div class="cmd-input">
  <span class="cmd-prompt">></span>
  <input type="text" placeholder="ask anything...">
  <div class="cmd-chips">
    <span class="chip">kiro</span>
    <span class="chip">claude</span>
  </div>
</div>
```

- 모노스페이스 `>` 프롬프트
- 인라인 칩
- 둥근 모서리 X (sharp 또는 6px)

### Status Pill
```html
<span class="pill pill-success">3 agreed</span>
<span class="pill pill-warning">2 conflicts</span>
```

---

## 8. 레이아웃 패턴

### Round Table (Discuss)
```
┌─ Header ──────────────────────────────────┐
├─ Round 1 ─────────────────────────────────┤
│  PM Question Card                          │
│  ┌─ kiro ──┐ ┌─ claude ┐ ┌─ copilot ┐    │
│  │ ...     │ │ ...     │ │ ...      │    │
│  └─────────┘ └─────────┘ └──────────┘    │
│  PM Synthesis Card                         │
├─ Round 2 ─────────────────────────────────┤
│  ...                                       │
├───────────────────────────────────────────┤
│  Command Input                             │
└───────────────────────────────────────────┘
```

### Chat (PM-led)
```
┌─ Header ──────────────────────────────────┐
├──┬────────────────────────────────────────┤
│Sb│  pm/claude > ...                       │
│ide│                                        │
│  │  user >                              ...│
│  │                                        │
│  │  kiro/auto > ...                       │
├──┴────────────────────────────────────────┤
│  > [command input]   [chips]              │
└───────────────────────────────────────────┘
```

### Compare
```
┌─ Header + Query ──────────────────────────┐
├─ Consensus Bar ───────────────────────────┤
├──────────┬──────────┬──────────────────────┤
│ kiro     │ claude   │ copilot              │
│ violet   │ amber    │ mint                 │
│ ...      │ ...      │ ...                  │
├──────────┴──────────┴──────────────────────┤
│  Recommendation                            │
└───────────────────────────────────────────┘
```

---

## 9. 애니메이션

### 원칙
- **최소화**: 화려한 애니메이션 X
- **기능적**: 상태 변화만
- **빠르게**: 150-250ms

### 허용
```css
/* Fade in */
animation: fadeIn 200ms ease;
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Pulse (응답 중) */
animation: pulse 1.2s ease-in-out infinite;
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Glow (액티브) */
box-shadow: 0 0 0 1px var(--accent);
transition: box-shadow 200ms ease;
```

### 금지
- bounce, spring, elastic
- 3D 회전
- parallax
- 화면 전체 트랜지션

---

## 10. 반응형 브레이크포인트

```
mobile:   < 768px    → 사이드바 숨김, 단일 컬럼
tablet:   768-1024px → 사이드바 collapsed
desktop:  > 1024px   → full layout
```

---

## 11. 화면별 우선순위

| 우선순위 | 화면 | 모드 |
|---------|------|------|
| P0 | Chat | PM-led conversation |
| P0 | Round Table | Discuss mode |
| P1 | Compare | Ask mode |
| P2 | Sessions | History |
| P2 | Settings | Config |
| P3 | Hero | Landing/Onboarding |

P0부터 구현, P3는 마지막.

---

## 12. 절대 안 되는 것

- ❌ Bubble 채팅 UI (카톡 스타일)
- ❌ 큰 그림자, 다중 그림자
- ❌ 무지개 그라데이션
- ❌ 큰 둥근 모서리 (16px+)
- ❌ 본문에 monospace
- ❌ 5개 이상의 색상이 한 화면에
- ❌ 이모지 과다 사용
- ❌ 큰 3D 캐릭터를 채팅 영역에
- ❌ 사이드바 3개 (max 1 좌측 + 1 우측)
- ❌ 7px, 13px 같은 임의 spacing

---

## 13. 구현 우선순위

1. **CSS Tokens 정리** — variables 정의
2. **Layout Shell** — Header + Sidebar + Main
3. **Message Component** — agent tag + body + meta
4. **Command Input** — `> ` prompt 스타일
5. **Round Table View** — 라운드별 카드 그룹
6. **Compare View** — 3 컬럼 비교
7. **Sessions Sidebar** — 단순한 리스트
8. **Hero Page** — 절제된 마스코트

이대로 진행한다.
