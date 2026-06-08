-- Migration: Atomic Conversation Last Message and Unread Count Updates
-- Path: backendconnectify/supabase/migrations/202606080001_messaging_atomic_updates.sql

create or replace function public.update_conversation_last_message_atomic(
  p_conversation_id uuid,
  p_content text,
  p_sender_id uuid,
  p_type text default 'text'
) returns void
language plpgsql
security definer
as $$
begin
  -- 1. Update the conversation record
  update public.conversations
  set 
    last_message = jsonb_build_object(
      'content', p_content,
      'type', p_type,
      'sender', p_sender_id,
      'timestamp', timezone('utc', now())
    ),
    last_message_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_conversation_id;

  -- 2. Increment unread_count for all other participants atomically
  update public.conversation_participants
  set unread_count = unread_count + 1
  where conversation_id = p_conversation_id
    and user_id != p_sender_id;
end;
$$;

grant execute on function public.update_conversation_last_message_atomic(uuid, text, uuid, text) to service_role;
grant execute on function public.update_conversation_last_message_atomic(uuid, text, uuid, text) to authenticated;
grant execute on function public.update_conversation_last_message_atomic(uuid, text, uuid, text) to anon;
