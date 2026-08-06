# PharmFlow v1.4.1

우리 약국용 주문·품절 관리 웹앱입니다.

## 변경사항
- 로그인 화면에서 공개 회원가입 제거
- 관리자가 `직원 관리`에서 직원 이메일·이름·임시 비밀번호를 입력해 계정 생성
- 생성된 직원은 즉시 사용 가능
- 직원은 거래처와 설정을 조회만 가능

## Netlify 환경변수
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Functions 전용, 절대 `VITE_` 접두어를 붙이지 마세요)

## Supabase 설정
Authentication > Sign In / Providers > Email에서 `Allow new users to sign up`을 끄세요.

## 보안
`SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드에 포함되지 않고 Netlify Function에서만 사용됩니다.


## v1.4.1
- 주문처 코드 `JC`를 별도 도매 `JC`로 분류합니다.
- `JC`, `jc`, `Jc` 등 영문 대소문자를 구분하지 않습니다.


## v1.5 거래처 표준화
- 별도주문 시트 B열과 복시 시트 C열의 풀네임 거래처를 직접 인식합니다.
- 지원 표준명: 건화, 고가, 따로, 따로 희귀, 명인, 백제, 복산, 지오영, 지오팜, 하은, 하이(표시: 하이스트), 한미, 호림, JC.
- `jc`는 `JC`, `한미H`/`한미h`는 `한미`로 통합합니다.
- 거래처가 `복산,지오팜`처럼 둘 이상이면 첫 번째 거래처를 우선합니다.
- 기존 약칭도 호환됩니다.
- Netlify Functions 런타임은 Node.js 22로 고정하고 직원 생성 함수는 최신 Response 형식으로 반환합니다.
