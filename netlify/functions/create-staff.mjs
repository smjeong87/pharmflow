import { createClient } from '@supabase/supabase-js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return json(500, { error: '서버 환경변수가 설정되지 않았습니다.' });

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: '로그인이 필요합니다.' });

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await anon.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: '로그인 정보를 확인할 수 없습니다.' });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin
    .from('staff_profiles')
    .select('role,is_active')
    .eq('id', userData.user.id)
    .single();
  if (profileError || profile?.role !== 'admin' || !profile?.is_active) return json(403, { error: '관리자만 직원 계정을 만들 수 있습니다.' });

  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: '요청 형식이 올바르지 않습니다.' }); }
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const displayName = String(payload.display_name || '').trim();
  if (!email || !email.includes('@')) return json(400, { error: '올바른 이메일을 입력하세요.' });
  if (password.length < 8) return json(400, { error: '임시 비밀번호는 8자 이상이어야 합니다.' });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError) return json(400, { error: createError.message });

  const { error: upsertError } = await admin.from('staff_profiles').upsert({
    id: created.user.id,
    email,
    display_name: displayName,
    role: 'employee',
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { error: upsertError.message });
  }

  return json(200, { ok: true, user_id: created.user.id, email });
};
