
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\onboarding\page.tsx'
src = open(p, encoding='utf-8').read()

# New primary goals list
old_primary = "['Lose fat','Build muscle','Improve performance','Build strength','General fitness','Rehab / injury recovery'].map(g => chip(g, data.primary_goal===g, ()=>set('primary_goal',g), '#f5a623'))"
new_primary = """[
                    'Weight Loss / Fat Loss',
                    'Weight Gain',
                    'Body Recomposition',
                    'Build Strength',
                    'Build Muscle (Bulk)',
                    'General Health & Fitness',
                    'Mental Health & Wellness',
                    'Athletic Performance',
                    'Strength Sport (Powerlifting)',
                  ].map(g => chip(g, (Array.isArray(data.primary_goal) ? data.primary_goal as string[] : []).includes(g), ()=>toggle('primary_goal',g), '#f5a623'))"""

# New secondary goals list
old_secondary = "['Lose fat','Build muscle','Improve performance','Build strength','General fitness','Improve flexibility','Better sleep','More energy'].map(g => chip(g, data.secondary_goal===g, ()=>set('secondary_goal',g)))"
new_secondary = """[
                    'Better Sleep',
                    'Reduce Stress',
                    'More Energy',
                    'Improve Flexibility & Mobility',
                    'Better Nutrition Habits',
                    'Mental Clarity & Focus',
                    'Injury Rehab / Recovery',
                    'Longevity & Healthy Aging',
                  ].map(g => chip(g, (Array.isArray(data.secondary_goal) ? data.secondary_goal as string[] : []).includes(g), ()=>toggle('secondary_goal',g)))"""

# Update labels
old_label_primary = ">Primary Goal<"
new_label_primary = ">Primary Goals <span style={{ color:'#00c9b1', fontSize:10 }}>pick all that apply</span><"

old_label_secondary = ">Secondary Goal<"
new_label_secondary = ">Secondary Goals <span style={{ color:'#00c9b1', fontSize:10 }}>pick all that apply</span><"

print('primary found:', src.count(old_primary))
print('secondary found:', src.count(old_secondary))

src = src.replace(old_primary, new_primary)
src = src.replace(old_secondary, new_secondary)
src = src.replace(old_label_primary, new_label_primary)
src = src.replace(old_label_secondary, new_label_secondary)

open(p, 'w', encoding='utf-8').write(src)
print('done')
