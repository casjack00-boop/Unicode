-- Add optional replies without changing existing messages.
BEGIN;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_message_key ON messages (conversation_id, id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'messages'::regclass AND conname = 'messages_reply_same_conversation_fk') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_reply_same_conversation_fk
      FOREIGN KEY (conversation_id, reply_to_id) REFERENCES messages (conversation_id, id)
      ON DELETE SET NULL (reply_to_id);
  END IF;
END $$;
COMMIT;
