import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.https://bmlfoiohsehkntytadgo.supabase.co!
const supabaseAnonKey = process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtbGZvaW9oc2Voa250eXRhZGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODc0MTksImV4cCI6MjA4ODI2MzQxOX0.lBaTOZCWB9G0Ymcl7Fo38XlaqMdTsSTAUqBI4nYdbwo!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)