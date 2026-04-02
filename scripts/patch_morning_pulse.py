path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\client\MorningPulse.tsx'
src = open(path, encoding='utf-8').read()

# 1. Sleep step: change onClick to setSleep(n) only, add Next button
src = src.replace(
    "onClick={()=>stepNext(n, setSleep, 'energy')}",
    "onClick={()=>setSleep(n)}",
    1
)
# Add Next button after the sleep label line
src = src.replace(
    "            {sleep>0 && <div style={{ marginTop:12, fontSize:12, color:t.teal, fontWeight:700 }}>{['','Rough night \U0001f625','Could be better','Not bad \U0001f642','Pretty good!','Crushed it! \U0001f4aa'][sleep]}</div>}\n          </div>\n        )}\n\n        {/* \u2500\u2500 STEP 2: ENERGY \u2500\u2500 */}",
    """            {sleep>0 && <div style={{ marginTop:12, fontSize:12, color:t.teal, fontWeight:700 }}>{[\'\'\'Rough night \U0001f625\',\'Could be better\',\'Not bad \U0001f642\',\'Pretty good!\',\'Crushed it! \U0001f4aa\'][sleep]}</div>}
            {sleep>0 && (
              <button onClick={()=>setStep(\'energy\')}
                style={{ marginTop:16, width:\'100%\', padding:\'12px\', borderRadius:12, border:\'none\', background:\'linear-gradient(135deg,\'+t.teal+\',\'+t.teal+\'cc)\', color:\'#000\', fontSize:14, fontWeight:800, cursor:\'pointer\', fontFamily:"\'DM Sans\',sans-serif" }}>
                Next \u2192
              </button>
            )}
          </div>
        )}

        {/* \u2500\u2500 STEP 2: ENERGY \u2500\u2500 */}""",
    1
)

# 2. Energy step: change onClick to setEnergy(n) only, add Next button
src = src.replace(
    "onClick={()=>stepNext(n, setEnergy, 'sliders')}",
    "onClick={()=>setEnergy(n)}",
    1
)
src = src.replace(
    "            {energy>0 && <div style={{ marginTop:12, fontSize:12, color:t.yellow, fontWeight:700 }}>{[\'\'\'Running on fumes\',\'Low key tired\',\'Getting there\',\'Feeling good!\',\'Full send! \U0001f525\'][energy]}</div>}\n          </div>\n        )}\n\n        {/* \u2500\u2500 STEP 3: SLIDERS \u2500\u2500 */}",
    """            {energy>0 && <div style={{ marginTop:12, fontSize:12, color:t.yellow, fontWeight:700 }}>{[\'\'\'Running on fumes\',\'Low key tired\',\'Getting there\',\'Feeling good!\',\'Full send! \U0001f525\'][energy]}</div>}
            {energy>0 && (
              <button onClick={()=>setStep(\'sliders\')}
                style={{ marginTop:16, width:\'100%\', padding:\'12px\', borderRadius:12, border:\'none\', background:\'linear-gradient(135deg,\'+t.yellow+\',\'+t.orange+\')\', color:\'#000\', fontSize:14, fontWeight:800, cursor:\'pointer\', fontFamily:"\'DM Sans\',sans-serif" }}>
                Next \u2192
              </button>
            )}
          </div>
        )}

        {/* \u2500\u2500 STEP 3: SLIDERS \u2500\u2500 */}""",
    1
)

# 3. Rename step 4 from journal feel to morning note
src = src.replace(
    '<div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>Anything on your mind?</div>',
    '<div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>Morning note</div>',
    1
)
src = src.replace(
    "<div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>Optional \u2014 this is your space</div>",
    "<div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>Optional \u2014 separate from your daily journal</div>",
    1
)

open(path, 'w', encoding='utf-8').write(src)
print('done')
