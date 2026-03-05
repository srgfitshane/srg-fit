'use client'

export default function ClientDashboard() {
  return (
    <div style={{ background:'#080810', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans,sans-serif', color:'#eeeef8' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>💪</div>
        <div style={{ fontSize:32, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:8 }}>Welcome!</div>
        <div style={{ fontSize:16, color:'#5a5a78' }}>Client dashboard coming right up.</div>
      </div>
    </div>
  )
}
