
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\workout\[sessionId]\page.tsx'
src = open(p, encoding='utf-8').read()

old = '      // 2. Check consistency milestones'

new = '''      // 1b. Update consistency goals current_value
      const { data: consistencyGoals } = await supabase
        .from('client_goals')
        .select('id, target_value, current_value')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .eq('type', 'consistency')
      if (consistencyGoals?.length) {
        const { count: doneCount } = await supabase
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('status', 'completed')
        for (const goal of consistencyGoals) {
          const current = doneCount || 0
          await supabase.from('client_goals').update({ current_value: current }).eq('id', goal.id)
          if (current >= Number(goal.target_value)) {
            await supabase.from('client_goals').update({
              status: 'completed', completed_at: new Date().toISOString(), current_value: current,
            }).eq('id', goal.id)
            newMilestones.push(`Consistency goal crushed: ${current} workouts done!`)
          }
        }
      }

      // 2. Check consistency milestones'''

print('found:', src.count(old))
src = src.replace(old, new)
open(p, 'w', encoding='utf-8').write(src)
print('done')
