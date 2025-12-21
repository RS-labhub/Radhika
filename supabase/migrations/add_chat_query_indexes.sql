-- Indexes to speed up chat listing queries
create index if not exists chats_user_active_last_message_idx
  on chats (user_id, last_message_at desc)
  where is_archived = false and deleted_at is null;

create index if not exists chats_user_mode_profile_active_last_message_idx
  on chats (user_id, mode, profile_id, last_message_at desc)
  where is_archived = false and deleted_at is null;
