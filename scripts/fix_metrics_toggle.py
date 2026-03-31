
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# The outer guard wraps snapshot card + chart section (lines ~236-400)
# We want: snapshot card stays guarded, chart always renders (weight-only when off)
# 
# Current structure:
#   {show_body_metrics && (<>
#     <SnapshotCard />         <- keep guarded
#     <ChartSection />         <- move outside guard
#   </>)}
#
# Find the closing of the snapshot card - it's before "Chart" comment
old = "      {clientRecord?.show_body_metrics !== false && (<>\n      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'16px 18px', marginBottom:20 }}>"
new = "      {clientRecord?.show_body_metrics !== false && (\n      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'16px 18px', marginBottom:20 }}>"

print('found outer guard:', src.count(old))
src = src.replace(old, new)

# Now find the closing </> that matches and replace with just )
# The closing is at line 400: </>)}
# After snapshot card closes (before Chart comment) we need to close just the snapshot
# Find "{/* Chart */}" and add the closing ) before it, then remove the </>)} at end

chart_comment = "      {/* Chart */}"
snapshot_close = "      )}\n\n      {/* Chart */}"

# Find where snapshot card div ends - it's right before the Chart comment
# Need to close the conditional before Chart
src = src.replace(
    "      {/* Chart */}",
    "      )}\n\n      {/* Chart - always visible, filtered by show_body_metrics */}\n      {(() => {"
)

# Now find the </>)} that was the old closing and replace
src = src.replace("      </>)}", "      })()")

open(p, 'w', encoding='utf-8').write(src)
print('done')
print('show_body_metrics count:', src.count('show_body_metrics'))
