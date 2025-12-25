-- Add page_type column
ALTER TABLE signup_pages ADD COLUMN page_type TEXT DEFAULT 'landing';

-- Add form customization columns
ALTER TABLE signup_pages ADD COLUMN button_text TEXT DEFAULT '登録する';
ALTER TABLE signup_pages ADD COLUMN form_fields TEXT DEFAULT 'email,name';
ALTER TABLE signup_pages ADD COLUMN email_label TEXT DEFAULT 'メールアドレス';
ALTER TABLE signup_pages ADD COLUMN email_placeholder TEXT DEFAULT 'example@email.com';
ALTER TABLE signup_pages ADD COLUMN name_label TEXT DEFAULT 'お名前';
ALTER TABLE signup_pages ADD COLUMN name_placeholder TEXT DEFAULT '山田 太郎';
ALTER TABLE signup_pages ADD COLUMN success_message TEXT DEFAULT '確認メールを送信しました';

-- Add landing page columns
ALTER TABLE signup_pages ADD COLUMN pending_title TEXT DEFAULT '確認メールを送信しました';
ALTER TABLE signup_pages ADD COLUMN pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。';
ALTER TABLE signup_pages ADD COLUMN confirmed_title TEXT DEFAULT '登録が完了しました';
ALTER TABLE signup_pages ADD COLUMN confirmed_message TEXT DEFAULT 'ニュースレターへのご登録ありがとうございます。';

-- Add embed page columns
ALTER TABLE signup_pages ADD COLUMN embed_theme TEXT DEFAULT 'light';
ALTER TABLE signup_pages ADD COLUMN embed_size TEXT DEFAULT 'full';
