-- Indexes to speed up chat message fetches
create index if not exists chat_messages_chat_id_created_at_idx
  on public.chat_messages (chat_id, created_at desc);
