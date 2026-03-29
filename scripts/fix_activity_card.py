path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
with open(path, encoding='utf-8') as f:
    content = f.read()

start_marker = '          {/* \u2500\u2500 5. EXTRA ACTIVITY \u2500\u2500 */'
end_marker = "                  {recentActivities.slice(0, 3).map((activity) => {"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

new_block = (
    '          {/* \u2500\u2500 5. EXTRA ACTIVITY \u2014 only shown when logged \u2500\u2500 */}\n'
    '          {recentActivities.length > 0 && (\n'
    '          <div style={{ background:t.surface, border:\'1px solid \'+t.border, borderRadius:16, overflow:\'hidden\', marginBottom:14 }} className="fade">\n'
    '            <div style={{ height:3, background:\'linear-gradient(90deg,\'+t.green+\',\'+t.teal+\')\' }}/>\n'
    '            <div style={{ padding:\'14px 16px\' }}>\n'
    '              <div style={{ display:\'flex\', alignItems:\'center\', gap:10, marginBottom:12 }}>\n'
    '                <div style={{ width:38, height:38, borderRadius:11, background:t.greenDim, border:\'1px solid \'+t.green+\'30\', display:\'flex\', alignItems:\'center\', justifyContent:\'center\', fontSize:17, flexShrink:0 }}>\U0001f33f</div>\n'
    '                <div style={{ minWidth:0 }}>\n'
    '                  <div style={{ fontSize:14, fontWeight:800 }}>Extra activity</div>\n'
    '                  <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>Outside your programmed sessions</div>\n'
    '                </div>\n'
    '              </div>\n'
    '              <div style={{ display:\'flex\', flexDirection:\'column\', gap:8 }}>\n'
    '                  {recentActivities.slice(0, 3).map((activity) => {'
)

new_content = content[:start_idx] + new_block + content[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done. Replaced', end_idx - start_idx, 'chars with', len(new_block), 'chars')
