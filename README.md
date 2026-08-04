# PharmFlow v1.4

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
