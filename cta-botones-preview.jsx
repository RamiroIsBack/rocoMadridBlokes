export default function CTABotones() {
  const styles = {
    body: {
      fontFamily: "'Montserrat', 'Arial Black', sans-serif",
      background: "#2e2e2e",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      padding: "40px 20px",
    },
    wrapper: {
      display: "flex",
      flexDirection: "row",
      gap: "24px",
      justifyContent: "center",
      alignItems: "stretch",
      flexWrap: "wrap",
    },
    btnBase: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "18px",
      width: "400px",
      minHeight: "110px",
      padding: "24px 30px",
      borderRadius: "20px",
      textDecoration: "none",
      fontFamily: "'Montserrat', sans-serif",
      fontWeight: 800,
      fontSize: "17px",
      lineHeight: 1.3,
      letterSpacing: "0.02em",
      textAlign: "left",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      transition: "transform 0.18s ease, box-shadow 0.18s ease",
      position: "relative",
      overflow: "hidden",
    },
    btnPrimary: {
      background: "linear-gradient(135deg, #d4a017 0%, #b8870f 100%)",
      boxShadow: "0 8px 28px rgba(212, 160, 23, 0.45)",
    },
    btnSecondary: {
      background: "linear-gradient(135deg, #4a4a4a 0%, #333333 100%)",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.4)",
      border: "2px solid rgba(255,255,255,0.12)",
    },
    iconWrap: {
      width: "52px",
      height: "52px",
      borderRadius: "14px",
      background: "rgba(255,255,255,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    iconWrapGold: {
      background: "rgba(255,255,255,0.2)",
    },
    textWrap: {
      display: "flex",
      flexDirection: "column",
      gap: "3px",
    },
    label: {
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      opacity: 0.72,
    },
    title: {
      fontSize: "16px",
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1.25,
    },
  };

  // Climbing icon SVG
  const ClimbIcon = () => (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Wall */}
      <line x1="8" y1="2" x2="8" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
      {/* Holds */}
      <rect x="3" y="6" width="6" height="3" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="3" y="14" width="5" height="3" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="3" y="22" width="6" height="3" rx="1.5" fill="white" opacity="0.5"/>
      {/* Climber head */}
      <circle cx="19" cy="5" r="3" fill="white"/>
      {/* Body */}
      <path d="M19 8 L16 14 L11 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 8 L21 15 L25 18" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Legs */}
      <path d="M16 14 L14 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M21 15 L23 23" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      {/* Arrow up */}
      <path d="M25 4 L28 1 M25 1 L28 1 L28 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75"/>
    </svg>
  );

  // Classes icon SVG
  const ClassIcon = () => (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Graduation cap */}
      <polygon points="15,4 26,9 15,14 4,9" fill="white" opacity="0.9"/>
      <path d="M23.5 10.5 L23.5 17" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M22 17 Q23.5 19.5 25 17" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9"/>
      {/* Building / door */}
      <rect x="8" y="16" width="14" height="11" rx="2" fill="white" opacity="0.15" stroke="white" strokeWidth="1.8"/>
      <rect x="12" y="21" width="6" height="6" rx="1" fill="white" opacity="0.5"/>
      {/* People inside */}
      <circle cx="15" cy="19.5" r="1.2" fill="white" opacity="0.8"/>
    </svg>
  );

  return (
    <div style={styles.body}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght+600;700;800&display=swap');
        .cta-btn:hover { transform: translateY(-3px) !important; filter: brightness(1.1); }
        @media (max-width: 860px) {
          .cta-wrapper { flex-direction: column !important; align-items: center !important; }
          .cta-btn { width: 100% !important; max-width: 400px !important; }
        }
      `}</style>

      <div className="cta-wrapper" style={styles.wrapper}>

        {/* Botón 1: Escalar */}
        <a
          href="https://rocomadrid.com/actividades"
          className="cta-btn"
          style={{ ...styles.btnBase, ...styles.btnPrimary }}
        >
          <div style={{ ...styles.iconWrap, ...styles.iconWrapGold }}>
            <ClimbIcon />
          </div>
          <div style={styles.textWrap}>
            <span style={styles.label}>Rocódromo · Madrid</span>
            <span style={styles.title}>Ven a escalar<br/>con nosotros</span>
          </div>
        </a>

        {/* Botón 2: Clases */}
        <a
          href="https://rocomadrid.com/actividades/clases-de-escalada"
          className="cta-btn"
          style={{ ...styles.btnBase, ...styles.btnSecondary }}
        >
          <div style={styles.iconWrap}>
            <ClassIcon />
          </div>
          <div style={styles.textWrap}>
            <span style={styles.label}>Para todos los niveles</span>
            <span style={styles.title}>Apúntate a<br/>nuestras clases</span>
          </div>
        </a>

      </div>
    </div>
  );
}
