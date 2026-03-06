-- Migration 005: Add Google Drive video columns to exercises table
-- Videos stay in Google Drive; we store file IDs and embed URLs in Supabase

alter table exercises
  add column if not exists drive_file_id   text,
  add column if not exists drive_thumbnail text,
  add column if not exists drive_link      text;

-- Update video_url column comment for clarity
comment on column exercises.video_url is 'Google Drive embed URL: https://drive.google.com/file/d/{id}/preview';
comment on column exercises.drive_file_id is 'Google Drive file ID for direct API access';
comment on column exercises.drive_thumbnail is 'Google Drive thumbnail URL';
comment on column exercises.drive_link is 'Google Drive view link for sharing';
