
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
src = open(p, encoding='utf-8').read()

suggest_fn = '''
  const suggestGoal = async () => {
    if (!clientRecord || !suggestGoalText.trim()) return
    setSuggestGoalSaving(true)
    const coachId = '133f93d0-2399-4542-bc57-db4de8b98d79'
    const { data: newGoal } = await supabase.from('client_goals').insert({
      client_id: clientRecord.id,
      coach_id: coachId,
      title: suggestGoalText.trim(),
      type: 'weight_lifted',
      target_value: null,
      unit: 'lbs',
      status: 'active',
      suggested_by: 'client',
    }).select().single()
    if (newGoal) setActiveGoals(prev => [...prev, newGoal as ClientGoalRecord])
    setSuggestGoalText('')
    setSuggestGoalOpen(false)
    setSuggestGoalSaving(false)
  }

'''

src = src.replace(
    '  const sharePRToCommunity = async',
    suggest_fn + '  const sharePRToCommunity = async'
)

open(p, 'w', encoding='utf-8').write(src)
print('done, suggestGoal count:', src.count('const suggestGoal'))
