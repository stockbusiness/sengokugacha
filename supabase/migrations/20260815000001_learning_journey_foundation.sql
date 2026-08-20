-- 千ノ国パスポート「はじまりの旅」実装指示書［第2次修正版］PR2(ミッション基盤)。
--
-- 設計判断の根拠は docs/PASSPORT_LEARNING_JOURNEY_ADR.md、調査結果は
-- docs/PASSPORT_LEARNING_MISSION_CURRENT_STATE.md を参照。
--
-- 既存の「本日の任務」(daily_mission_completions / src/lib/daily-missions.ts /
-- /api/missions)とは別概念のため、指示書§4.3のとおり learning_journey_ 接頭辞で
-- 統一し、既存テーブルと衝突させない。
--
-- このマイグレーションを適用しただけでは何も起きない。機能フラグは全て false で、
-- コースが1本も無ければ利用者側に何も表示されない。

-- ============================================================
-- 機能フラグ・運用パラメータ(指示書§17)
-- ============================================================
-- ADR-9: このリポジトリに汎用の機能フラグ基盤は無く、設定は「ドメインごとの設定
-- テーブル + 管理画面」で統一されている(line_settings / payment_settings /
-- castle_lord_plan_settings 等)。環境変数を新設せず、その作法に合わせる。
create table learning_journey_settings (
  id uuid primary key default gen_random_uuid(),

  -- 指示書§17の4フラグ。全て既定OFF。
  missions_enabled boolean not null default false,           -- LEARNING_MISSIONS_ENABLED
  rewards_enabled boolean not null default false,            -- MISSION_REWARDS_ENABLED
  consultation_sync_enabled boolean not null default false,  -- MISSION_CONSULTATION_SYNC_ENABLED
  line_notifications_enabled boolean not null default false, -- MISSION_LINE_NOTIFICATIONS_ENABLED

  -- 指示書§8.5「付与総量の上限」。0は「上限なし」ではなく「1円も付与しない」を意味する
  -- (未設定のまま実証を始めて上限が効かない事故を防ぐため、既定を0にしている)。
  course_reward_cap integer not null default 0 check (course_reward_cap >= 0),
  period_reward_cap integer not null default 0 check (period_reward_cap >= 0),
  -- 1回の付与要求で許容する上限。運営が誤って桁を間違えた教材を公開した場合の最後の砦。
  per_request_reward_cap integer not null default 10000 check (per_request_reward_cap >= 0),

  -- 指示書§8.3「PENDING/PROCESSINGが設定時間を超えたら要対応一覧へ表示する」。
  -- 自動でFAILEDへ落とさないための、あくまで表示上のしきい値。
  stale_reward_minutes integer not null default 60 check (stale_reward_minutes > 0),

  -- 指示書§4.1「30日以内の途中再開」。教材の再開可否と付与対象期間は別設定にする。
  resume_window_days integer not null default 30 check (resume_window_days > 0),
  reward_window_days integer not null default 30 check (reward_window_days > 0),

  updated_at timestamptz not null default now()
);

alter table learning_journey_settings enable row level security;

comment on table learning_journey_settings is
  '「はじまりの旅」の機能フラグと運用パラメータ。1行のみ運用(payment_settings等と同じ)。';

-- ============================================================
-- コース・ミッション・教材
-- ============================================================

-- ADR-4: 新しい tenant_id は作らず、既存の project_key に寄せる。
-- 値が未決定のため当面は全行NULL(= 戦国パスポート単体)で運用する。
create table learning_journey_courses (
  id uuid primary key default gen_random_uuid(),
  project_key text,
  code text not null unique,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'suspended')),
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table learning_journey_courses enable row level security;
create index idx_learning_journey_courses_status on learning_journey_courses (status, display_order);
create index idx_learning_journey_courses_project on learning_journey_courses (project_key);

comment on column learning_journey_courses.project_key is
  'スコープ識別子。値が未確定のため当面NULL(戦国パスポート単体)。ADR-4参照。';

create table learning_journey_missions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references learning_journey_courses(id) on delete cascade,
  code text not null,
  title text not null,
  display_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'suspended')),
  starts_at timestamptz,
  ends_at timestamptz,

  -- 完了条件(指示書§6の「最小完了条件」を data driven に表現する)。
  -- 判定ロジックは src/modules/learning-journey/domain/mission-rules.ts の純粋関数。
  require_content_viewed boolean not null default true,
  require_all_questions_answered boolean not null default false,
  min_correct_answers integer not null default 0 check (min_correct_answers >= 0),
  -- 指示書§6のミッション3「指定操作または代替回答」・ミッション4「体験実績または代替回答」。
  -- 外部サービス側の体験実績を完了条件にするかどうか。
  require_external_achievement boolean not null default false,
  -- 指示書§6「外部サービスの体験実績APIが未整備の場合、初期版は回答による自己申告を許可し、
  -- その記録に SELF_REPORTED を残すこと」。require_external_achievement が true のとき、
  -- 実績を確認できなくても自己申告で完了させてよいかを表す。
  allow_self_report boolean not null default false,

  -- 付与予定数。実際に付与するかは learning_journey_settings.rewards_enabled 次第。
  reward_amount integer not null default 0 check (reward_amount >= 0),
  -- 自己申告のみで完了した場合の付与数(指示書§6「他のミッションより低くする、付与対象外にする、
  -- 外部実績確認後に差額を追加する等の選択肢から正式決定する」)。NULLならreward_amountと同じ。
  self_report_reward_amount integer check (self_report_reward_amount >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, code)
);

alter table learning_journey_missions enable row level security;
create index idx_learning_journey_missions_course on learning_journey_missions (course_id, display_order);

-- ADR-3: 教材・設問・選択肢を1つのバージョンとして束ねる。公開済みバージョンは
-- 上書きせず、新しいバージョンを追加する(追記のみ)。これにより過去の回答は
-- content_version_id を辿るだけで回答時点の内容を再現できる。
create table learning_journey_content_versions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references learning_journey_missions(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),

  -- 教材本体。動画を再生できない環境向けに本文と画像の代替を必ず持てるようにする(指示書§12)。
  body_text text,
  video_url text,
  image_url text,
  -- 動画を見られない利用者向けの代替テキスト。video_urlがあるなら埋めることを運用ルールとする。
  video_alt_text text,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (mission_id, version)
);

alter table learning_journey_content_versions enable row level security;
create index idx_learning_journey_content_versions_mission
  on learning_journey_content_versions (mission_id, version desc);

-- 公開済みバージョンを書き換えさせない(ADR-3の前提を DB 側でも守る)。
-- draft のうちは自由に編集でき、published にした後は body/設問を変更できない。
create or replace function learning_journey_content_versions_guard()
returns trigger as $$
begin
  if old.status = 'published' and new.status = 'published' then
    if new.body_text is distinct from old.body_text
       or new.video_url is distinct from old.video_url
       or new.image_url is distinct from old.image_url
       or new.video_alt_text is distinct from old.video_alt_text
       or new.mission_id is distinct from old.mission_id
       or new.version is distinct from old.version then
      raise exception 'learning_journey_content_version_published_immutable';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_learning_journey_content_versions_guard
  before update on learning_journey_content_versions
  for each row execute function learning_journey_content_versions_guard();

create table learning_journey_questions (
  id uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references learning_journey_content_versions(id) on delete cascade,
  display_order integer not null default 0,
  -- quiz: 正解あり / single: 単一選択アンケート / multi: 複数選択アンケート / free_text: 任意の短文感想
  question_type text not null check (question_type in ('quiz', 'single', 'multi', 'free_text')),
  body text not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

alter table learning_journey_questions enable row level security;
create index idx_learning_journey_questions_version
  on learning_journey_questions (content_version_id, display_order);

create table learning_journey_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references learning_journey_questions(id) on delete cascade,
  display_order integer not null default 0,
  body text not null,
  -- 指示書§11「クイズの正解を回答前のフロントへ送らない」。この列は参加者向けAPIの
  -- レスポンスに絶対に含めないこと(採点はサーバー側のみ)。
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

alter table learning_journey_choices enable row level security;
create index idx_learning_journey_choices_question on learning_journey_choices (question_id, display_order);

comment on column learning_journey_choices.is_correct is
  '正解フラグ。参加者向けAPIのレスポンスに含めてはならない(指示書§11)。';

-- ============================================================
-- 参加者の登録・進捗・回答・完了
-- ============================================================

-- 指示書§7.2「同一ユーザー・同一コースの意図しない重複登録を防止し、再登録を許可する
-- 場合は enrollment_id または登録連番で識別する」。
create table learning_journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references learning_journey_courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  enrollment_seq integer not null default 1 check (enrollment_seq > 0),
  project_key text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'withdrawn')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id, enrollment_seq)
);

alter table learning_journey_enrollments enable row level security;
create index idx_learning_journey_enrollments_user on learning_journey_enrollments (user_id, course_id);

-- 進行中の登録は同一ユーザー・同一コースにつき1件まで(再登録は前の登録を終えてから)。
create unique index uq_learning_journey_enrollments_active
  on learning_journey_enrollments (course_id, user_id)
  where status = 'in_progress';

create table learning_journey_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references learning_journey_enrollments(id) on delete cascade,
  mission_id uuid not null references learning_journey_missions(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  content_viewed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, mission_id)
);

alter table learning_journey_progress enable row level security;
create index idx_learning_journey_progress_enrollment on learning_journey_progress (enrollment_id);

-- 回答。ADR-3により content_version_id / question_id / choice_id を辿れば
-- 回答時点の設問文・選択肢文言が再現できる(スナップショットを持たない)。
create table learning_journey_answers (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references learning_journey_enrollments(id) on delete cascade,
  mission_id uuid not null references learning_journey_missions(id) on delete cascade,
  content_version_id uuid not null references learning_journey_content_versions(id),
  question_id uuid not null references learning_journey_questions(id),
  -- 選択式は choice_id、free_text は free_text。両方NULLは「未回答」を意味しない
  -- (未回答なら行自体を作らない)。
  choice_id uuid references learning_journey_choices(id),
  free_text text,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  -- 同じ設問へ同じ選択肢を二重送信しても行が増えないようにする(指示書§14.1「同一回答の再送」)。
  -- 複数選択(multi)は1設問に複数行できるため、choice_id を一意キーに含める。
  unique (enrollment_id, question_id, choice_id)
);

alter table learning_journey_answers enable row level security;
create index idx_learning_journey_answers_enrollment on learning_journey_answers (enrollment_id, mission_id);

-- 指示書§7.2「同一コース登録内での同一ミッションの重複完了を UNIQUE(enrollment_id, mission_id) で防止する」。
create table learning_journey_completion_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references learning_journey_enrollments(id) on delete cascade,
  mission_id uuid not null references learning_journey_missions(id) on delete cascade,
  content_version_id uuid not null references learning_journey_content_versions(id),
  -- ANSWERED: 通常の完了 / SELF_REPORTED: 外部実績APIが無いため自己申告で完了(指示書§6)
  completion_source text not null default 'ANSWERED'
    check (completion_source in ('ANSWERED', 'SELF_REPORTED')),
  completed_at timestamptz not null default now(),
  unique (enrollment_id, mission_id)
);

alter table learning_journey_completion_events enable row level security;
create index idx_learning_journey_completion_events_mission
  on learning_journey_completion_events (mission_id, completed_at);

-- ============================================================
-- 付与要求(送信はPR5。ここでは構造だけ用意する)
-- ============================================================
-- ADR-5: 完了イベントと付与要求の構造は送信先に依らず共通にし、送信アダプタだけ
-- 差し替える。ウォレットが本番稼働していないため、当面は全て PENDING のまま保留される。
--
-- ADR-6: ウォレットの付与APIは common_user_id を受け付けず service_code +
-- external_user_id で解決する。external_user_id には users.id を送ることで合意済み。
-- 一度作成した external_user_id はリネームできず、復旧は管理画面での二段階承認による
-- アカウント統合のみのため、要求作成時に確定した値を保存し以後書き換えない。
create table learning_journey_reward_requests (
  id uuid primary key default gen_random_uuid(),
  completion_event_id uuid not null unique references learning_journey_completion_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  -- 送信時に使う値。作成時点で確定させ、以後書き換えない。
  external_user_id text not null,
  -- 記録用。解決できていない場合はNULL(指示書§9「共通IDを取得できない場合は付与を行わない」)。
  common_user_id text,

  amount integer not null check (amount >= 0),
  -- 自己申告のみで完了したかどうか。付与額の根拠を後から追えるようにする。
  completion_source text not null default 'ANSWERED'
    check (completion_source in ('ANSWERED', 'SELF_REPORTED')),

  -- 指示書§8.3の7状態。CANCELLED/REVERSEDは自動遷移させず管理者操作+監査ログを必須とする。
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'LIMIT_HELD', 'CANCELLED', 'REVERSED')),

  -- ADR-8。ウォレットはこれをリクエストボディのフィールドとして受け取る(ヘッダーではない)。
  idempotency_key text not null unique,

  -- 送信結果。SUCCEEDED時にウォレットの取引IDを保存する。
  wallet_transaction_id text,
  -- REVERSED時のウォレット側取消取引ID。パスポート側だけで送信済み取引の状態を変えないため。
  wallet_reversal_transaction_id text,
  attempt_count integer not null default 0,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table learning_journey_reward_requests enable row level security;
create index idx_learning_journey_reward_requests_status
  on learning_journey_reward_requests (status, created_at);
create index idx_learning_journey_reward_requests_user
  on learning_journey_reward_requests (user_id, created_at);

comment on column learning_journey_reward_requests.external_user_id is
  'ウォレットへ送る識別子(users.id)。一度送るとリネームできないため作成後は書き換えない。ADR-6参照。';

-- ============================================================
-- 監査ログの拡張(ADR-10)
-- ============================================================
-- 指示書§7末尾が要求する6項目のうち、対象種別・対象ID・変更前後の値は
-- 20260729000001 で追加済み。不足していた3つをNULL許容列として足す。
-- 既存の106箇所の呼び出しは無変更で動く(後方互換)。新規監査テーブルは作らない。
alter table admin_audit_logs add column admin_role text;
alter table admin_audit_logs add column request_id text;
alter table admin_audit_logs add column operation_reason text;

comment on column admin_audit_logs.admin_role is
  '操作時の管理者ロール(operator/manager)。共有パスワード方式のため、実行者名と同じく自己申告の域を出ない点に注意。';
comment on column admin_audit_logs.operation_reason is
  '重要操作(付与上限変更・LIMIT_HELD解除・取消訂正・緊急停止)で必須とする操作理由。指示書§11。';

create index idx_admin_audit_logs_request_id on admin_audit_logs (request_id) where request_id is not null;
