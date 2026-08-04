# PharmFlow

약국 주문 엑셀을 도매별 메시지와 엑셀로 변환하고, 까는약·품절·주문이력·거래처 정보를 관리하는 React + Vite 웹앱입니다.

## 1. Supabase

새 Supabase 프로젝트의 SQL Editor에서 `supabase_setup.sql`을 한 번 실행합니다.

Authentication 이메일 로그인은 테스트 단계에서 `Confirm email`을 끄거나, 관리자가 사용자를 생성할 때 이메일 확인 처리합니다.

## 2. GitHub 업로드

이 폴더 안의 파일과 `src` 폴더를 저장소 최상위에 업로드합니다. ZIP 파일 자체를 올리지 않습니다.

## 3. Netlify

GitHub 저장소를 Import한 뒤 아래 설정을 사용합니다.

- Branch: `main`
- Base directory: 비움
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: 비움

Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

환경변수를 저장한 뒤 Deploy합니다.

## 기능

- 이메일 회원가입·로그인
- 주문 엑셀 드래그앤드롭
- 별도주문: B열 주문처, C열 품목, D열 수량
- 복시: C열 예외 주문처, D열 품목, E열 수량
- 코드 분류: A/건=건화, 하이=하이스트, 하=하은, 호=호림, 복=복산, 영=지오영, B=백제, M=명인, 인=인천, 고가=고가, 나머지=복시
- 품목명 끝의 괄호 내용 제거
- 도매별 메시지·엑셀, 전체 엑셀
- 까는약 별도 추출
- 중복·수량 이상·품절 주문 확인
- 상시 품절목록
- 날짜별 주문이력
- 거래처 담당자 정보 공유
