-- PharmFlow v1.4
-- DB 구조 변경은 없습니다. 공개 회원가입을 끈 뒤 관리자가 Netlify Function으로 직원을 생성합니다.
-- Supabase Dashboard > Authentication > Sign In / Providers > Email에서
-- "Allow new users to sign up"을 OFF로 설정하세요.

-- 기존 승인대기 계정이 있다면 필요에 따라 아래에서 직접 비활성화할 수 있습니다.
-- update public.staff_profiles set is_active = false where role = 'employee';
