import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ASK GROUP SARL — LOGICIEL DE SUIVI RH v2
// Agents RDC (USD) + Agents Tunisie (DT/USD) — Tableaux séparés
// Charges sociales RDC affichées séparément du salaire agent
// ============================================================

const SUPABASE_URL = "https://sfuuzluaysxrdcqtvuto.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdXV6bHVheXN4cmRjcXR2dXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTU2OTEsImV4cCI6MjA5NzU5MTY5MX0.2N6_dYs56LLV6hLLkxippeyxrMNSp9VlBUt_GUdEdcM";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NAVY = "#0A1B3D";
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F2E2A8";
const APP_NAME = "suivi_rh";

// Taux de change DT -> USD (à mettre à jour manuellement)
const DT_TO_USD_DEFAULT = 0.32; // 1 DT ≈ 0.32 USD

function uid() { return Math.random().toString(36).slice(2, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthKey(d) { return d.slice(0, 7); }

function joursOuvrables(year, month) {
  let count = 0;
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const HEURE_DEBUT = "09:00";
const HEURES_JOUR = 8;

// Taux charges sociales RDC (affichées séparément, pas déduites du salaire)
const TAUX_RDC = { cnssSal: 0.05, ipr: 0.15, cnssPat: 0.13, inpp: 0.03, onem: 0.02 };

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [storedPassword, setStoredPassword] = useState(null);
  const [setupMode, setSetupMode] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [connError, setConnError] = useState("");
  const [page, setPage] = useState("pointage");
  const [agents, setAgents] = useState([]);
  const [pointages, setPointages] = useState([]);
  const [monthParams, setMonthParams] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [dtToUsd, setDtToUsd] = useState(DT_TO_USD_DEFAULT);

  // Vérification mot de passe
  useEffect(() => {
    async function checkPassword() {
      const { data, error } = await supabase.from("app_passwords").select("*").eq("app_name", APP_NAME).maybeSingle();
      if (error) { setConnError("Erreur de connexion : " + error.message); return; }
      if (data) setStoredPassword(data.password);
      else setSetupMode(true);
    }
    checkPassword();
  }, []);

  // Chargement données
  useEffect(() => {
    if (!unlocked) return;
    async function loadAll() {
      const [a, p, mp] = await Promise.all([
        supabase.from("agents").select("*").order("created_at"),
        supabase.from("pointages").select("*"),
        supabase.from("month_params").select("*"),
      ]);
      if (a.data) setAgents(a.data);
      if (p.data) setPointages(p.data.map(x => ({ ...x, agentId: x.agent_id, heureArrivee: x.heure_arrivee, heureDepart: x.heure_depart })));
      if (mp.data) setMonthParams(mp.data.map(x => ({ ...x, agentId: x.agent_id, salaireFixe: x.salaire_fixe, primePerformance: x.prime_performance, primeAssiduite: x.prime_assiduite || 0 })));
      setLoaded(true);
    }
    loadAll();
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [unlocked]);

  async function handleSetupPassword() {
    if (newPw.length < 4) { setPwError("Minimum 4 caractères."); return; }
    if (newPw !== newPw2) { setPwError("Les mots de passe ne correspondent pas."); return; }
    const { error } = await supabase.from("app_passwords").insert({ app_name: APP_NAME, password: newPw });
    if (error) { setPwError("Erreur : " + error.message); return; }
    setStoredPassword(newPw); setSetupMode(false); setUnlocked(true);
  }

  function handleUnlock() {
    if (pwInput === storedPassword) { setUnlocked(true); setPwError(""); }
    else setPwError("Mot de passe incorrect.");
  }

  async function handleChangePassword(oldPw, newPassword) {
    if (oldPw !== storedPassword) return false;
    await supabase.from("app_passwords").update({ password: newPassword }).eq("app_name", APP_NAME);
    setStoredPassword(newPassword);
    return true;
  }

  async function addAgent(nom, poste, localisation) {
    const newAgent = { id: uid(), nom, poste, localisation }; // localisation: "RDC" ou "TN"
    await supabase.from("agents").insert(newAgent);
    setAgents([...agents, newAgent]);
  }

  async function removeAgent(id) {
    if (!window.confirm("Supprimer cet agent ?")) return;
    await supabase.from("agents").delete().eq("id", id);
    setAgents(agents.filter(a => a.id !== id));
  }

  function getPointage(agentId, date) {
    return pointages.find(p => p.agentId === agentId && p.date === date);
  }

  async function upsertPointage(agentId, date, updates) {
    const existing = getPointage(agentId, date);
    const base = existing || { id: uid(), agentId, date, heureArrivee: "", heureDepart: "", statut: "present", justifie: true, notes: "" };
    const merged = { ...base, ...updates };
    setPointages(prev => existing ? prev.map(p => p.id === existing.id ? merged : p) : [...prev, merged]);
    const dbRow = { id: merged.id, agent_id: merged.agentId, date: merged.date, heure_arrivee: merged.heureArrivee, heure_depart: merged.heureDepart, statut: merged.statut, justifie: merged.justifie, notes: merged.notes };
    setSaveStatus("Enregistrement...");
    const { error } = await supabase.from("pointages").upsert(dbRow);
    setSaveStatus(error ? "Erreur" : "Enregistré ✓");
    setTimeout(() => setSaveStatus(""), 1500);
  }

  function getMonthParam(agentId, date) {
    const mk = monthKey(date);
    return monthParams.find(m => m.agentId === agentId && m.mois === mk) || { salaireFixe: 0, primeAssiduite: 0, primePerformance: 0 };
  }

  async function setMonthParam(agentId, date, updates) {
    const mk = monthKey(date);
    const existing = monthParams.find(m => m.agentId === agentId && m.mois === mk);
    const base = existing || { id: uid(), agentId, mois: mk, salaireFixe: 0, primeAssiduite: 0, primePerformance: 0 };
    const merged = { ...base, ...updates };
    setMonthParams(prev => existing ? prev.map(m => m.id === existing.id ? merged : m) : [...prev, merged]);
    await supabase.from("month_params").upsert({ id: merged.id, agent_id: merged.agentId, mois: merged.mois, salaire_fixe: merged.salaireFixe, prime_assiduite: merged.primeAssiduite, prime_performance: merged.primePerformance });
  }

  // Calcul salaire journalier
  function calculDuJour(agentId, date) {
    const p = getPointage(agentId, date);
    const mp = getMonthParam(agentId, date);
    const [year, month] = date.split("-").map(Number);
    const jOuvrables = joursOuvrables(year, month);
    const fixeJournalier = mp.salaireFixe / jOuvrables;

    if (!p || p.statut === "absent") return { fixeJournalier: 0, deductionRetard: 0, montantJour: 0, retardMinutes: 0, estAbsent: true, justifie: p ? p.justifie : false };

    const arriveeMin = timeToMinutes(p.heureArrivee);
    const debutMin = timeToMinutes(HEURE_DEBUT);
    let retardMinutes = 0;
    if (arriveeMin && arriveeMin > debutMin) retardMinutes = arriveeMin - debutMin;

    const tauxMin = fixeJournalier / (HEURES_JOUR * 60);
    const deductionRetard = retardMinutes * tauxMin;
    const montantJour = Math.max(0, fixeJournalier - deductionRetard);
    return { fixeJournalier, deductionRetard, montantJour, retardMinutes, estAbsent: false };
  }

  // Récapitulatif mensuel — agents RDC (USD)
  function recapMensuelRDC(agentId, date) {
    const mk = monthKey(date);
    const pts = pointages.filter(p => p.agentId === agentId && monthKey(p.date) === mk);
    let totalFixe = 0, retardTotal = 0, joursP = 0, joursA = 0, absNJ = 0;
    pts.forEach(p => {
      const c = calculDuJour(agentId, p.date);
      totalFixe += c.montantJour;
      retardTotal += c.retardMinutes;
      if (p.statut === "absent") { joursA++; if (!p.justifie) absNJ++; }
      else joursP++;
    });
    const mp = getMonthParam(agentId, date);
    const primeAss = mp.primeAssiduite || 0;
    const primePerf = mp.primePerformance || 0;
    const netAgent = totalFixe + primeAss + primePerf;
    // Charges sociales RDC (sur le salaire brut = salaire fixe mensuel)
    const brut = mp.salaireFixe;
    const cnssSal = brut * TAUX_RDC.cnssSal;
    const ipr = Math.max(0, (brut - cnssSal) * TAUX_RDC.ipr);
    const cnssPat = brut * TAUX_RDC.cnssPat;
    const inpp = brut * TAUX_RDC.inpp;
    const onem = brut * TAUX_RDC.onem;
    const chargesSocietes = cnssSal + ipr + cnssPat + inpp + onem;
    return { totalFixe, primeAss, primePerf, netAgent, joursP, joursA, absNJ, retardTotal, cnssSal, ipr, cnssPat, inpp, onem, chargesSocietes };
  }

  // Récapitulatif mensuel — agents Tunisie (DT)
  function recapMensuelTN(agentId, date) {
    const mk = monthKey(date);
    const pts = pointages.filter(p => p.agentId === agentId && monthKey(p.date) === mk);
    let totalFixe = 0, retardTotal = 0, joursP = 0, joursA = 0;
    pts.forEach(p => {
      const c = calculDuJour(agentId, p.date);
      totalFixe += c.montantJour;
      retardTotal += c.retardMinutes;
      if (p.statut === "absent") joursA++;
      else joursP++;
    });
    const mp = getMonthParam(agentId, date);
    const primeAss = mp.primeAssiduite || 0;
    const primePerf = mp.primePerformance || 0;
    const netDT = totalFixe + primeAss + primePerf;
    const netUSD = netDT * dtToUsd;
    return { totalFixe, primeAss, primePerf, netDT, netUSD, joursP, joursA, retardTotal };
  }

  const agentsRDC = agents.filter(a => a.localisation === "RDC" || !a.localisation);
  const agentsTN = agents.filter(a => a.localisation === "TN");
  const presentsToday = agents.filter(a => { const p = getPointage(a.id, selectedDate); return p && p.statut === "present"; }).length;
  const absentsToday = agents.filter(a => { const p = getPointage(a.id, selectedDate); return p && p.statut === "absent"; }).length;

  if (connError) return <div style={{ padding: 40, color: "#B4322B", fontFamily: "sans-serif" }}>⚠️ {connError}</div>;
  if (setupMode) return <SetupScreen newPw={newPw} setNewPw={setNewPw} newPw2={newPw2} setNewPw2={setNewPw2} onSubmit={handleSetupPassword} error={pwError} />;
  if (!unlocked) return <LoginScreen pwInput={pwInput} setPwInput={setPwInput} onSubmit={handleUnlock} error={pwError} />;
  if (!loaded) return <div style={{ padding: 40, color: NAVY, fontFamily: "sans-serif" }}>Chargement...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", background: "#F6F5F1" }}>
      {/* SIDEBAR */}
      <div style={{ width: 230, background: NAVY, color: "white", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 24px 20px", borderBottom: "1px solid rgba(255,255,255,.1)", marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 600 }}>ASK GROUP</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Suivi RH</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>🟢 Connecté — Données partagées</div>
        </div>
        {[["pointage","Pointage du jour"],["agents","Gestion des agents"],["params","Paramètres mensuels"],["recap","Récapitulatif"]].map(([k,l]) => (
          <div key={k} onClick={() => setPage(k)} style={{ padding: "12px 24px", fontSize: 13, cursor: "pointer", borderLeft: page===k ? `3px solid ${GOLD}` : "3px solid transparent", background: page===k ? "rgba(212,175,55,.12)" : "transparent", color: page===k ? GOLD_LIGHT : "rgba(255,255,255,.65)", fontWeight: page===k ? 600 : 400 }}>{l}</div>
        ))}
        <div style={{ margin: "20px 24px 0" }}>
          {saveStatus && <div style={{ color: "#8FD9B0", fontSize: 12, marginBottom: 8 }}>{saveStatus}</div>}
          <button onClick={() => setUnlocked(false)} style={{ width: "100%", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)", border: "none", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔒 Verrouiller</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, padding: "28px 36px", overflowX: "auto" }}>
        {page === "pointage" && <PointagePage agents={agents} agentsRDC={agentsRDC} agentsTN={agentsTN} selectedDate={selectedDate} setSelectedDate={setSelectedDate} getPointage={getPointage} upsertPointage={upsertPointage} calculDuJour={calculDuJour} presentsToday={presentsToday} absentsToday={absentsToday} total={agents.length} dtToUsd={dtToUsd} />}
        {page === "agents" && <AgentsPage agents={agents} agentsRDC={agentsRDC} agentsTN={agentsTN} addAgent={addAgent} removeAgent={removeAgent} />}
        {page === "params" && <ParamsPage agents={agents} agentsRDC={agentsRDC} agentsTN={agentsTN} selectedDate={selectedDate} setSelectedDate={setSelectedDate} getMonthParam={getMonthParam} setMonthParam={setMonthParam} dtToUsd={dtToUsd} setDtToUsd={setDtToUsd} onChangePassword={handleChangePassword} />}
        {page === "recap" && <RecapPage agents={agents} agentsRDC={agentsRDC} agentsTN={agentsTN} selectedDate={selectedDate} setSelectedDate={setSelectedDate} recapMensuelRDC={recapMensuelRDC} recapMensuelTN={recapMensuelTN} dtToUsd={dtToUsd} />}
      </div>
    </div>
  );
}

// ============================================================
// POINTAGE DU JOUR
// ============================================================
function PointagePage({ agents, agentsRDC, agentsTN, selectedDate, setSelectedDate, getPointage, upsertPointage, calculDuJour, presentsToday, absentsToday, total, dtToUsd }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: "#0A1B3D" }}>Pointage du jour</h1>
          <div style={{ fontSize: 12.5, color: "#6B6B63", marginTop: 3 }}>Saisie des heures d'arrivée, départ et statut</div>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "white", border: "1px solid #E4E1D8", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#0A1B3D" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        <Kpi label="Total agents" value={total} />
        <Kpi label="Présents" value={presentsToday} color="#1E7A4C" />
        <Kpi label="Absents" value={absentsToday} color="#B4322B" />
        <Kpi label="RDC / Tunisie" value={`${agentsRDC.length} / ${agentsTN.length}`} />
      </div>

      {/* Tableau RDC */}
      {agentsRDC.length > 0 && (
        <Panel title={`🇨🇩 Agents Kinshasa — RDC (${agentsRDC.length} agents) — Salaires en USD`} color="#1B3A6B">
          <TableauPointage agents={agentsRDC} selectedDate={selectedDate} getPointage={getPointage} upsertPointage={upsertPointage} calculDuJour={calculDuJour} devise="USD" fmt={v => v.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" USD"} />
        </Panel>
      )}

      {/* Tableau Tunisie */}
      {agentsTN.length > 0 && (
        <Panel title={`🇹🇳 Agents Tunisie (${agentsTN.length} agents) — Salaires en DT`} color="#8a6500">
          <TableauPointage agents={agentsTN} selectedDate={selectedDate} getPointage={getPointage} upsertPointage={upsertPointage} calculDuJour={calculDuJour} devise="DT" fmt={v => v.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" DT"} dtToUsd={dtToUsd} />
        </Panel>
      )}

      <div style={{ background: "#FFF8DC", border: "1px solid #E4E1D8", borderRadius: 10, padding: 14, fontSize: 12, color: "#0A1B3D", marginTop: 8 }}>
        💡 Le montant du retard est déduit proportionnellement du salaire journalier (salaire fixe mensuel ÷ jours ouvrables ÷ 8h × minutes de retard).
      </div>
    </>
  );
}

function TableauPointage({ agents, selectedDate, getPointage, upsertPointage, calculDuJour, devise, fmt, dtToUsd }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["Agent","Poste","Statut","Arrivée","Départ","Absent justifié ?","Retard","Montant jour","Note"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", background: "#FAFAF7", color: "#6B6B63", fontWeight: 600, fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid #E4E1D8", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => {
            const p = getPointage(agent.id, selectedDate) || { statut: "present", heureArrivee: "", heureDepart: "", justifie: true, notes: "" };
            const c = calculDuJour(agent.id, selectedDate);
            return (
              <tr key={agent.id}>
                <td style={tdStyle}><b>{agent.nom}</b></td>
                <td style={tdStyle}>{agent.poste}</td>
                <td style={tdStyle}>
                  <select value={p.statut} onChange={e => upsertPointage(agent.id, selectedDate, { statut: e.target.value })} style={inputStyle}>
                    <option value="present">Présent</option>
                    <option value="absent">Absent</option>
                  </select>
                </td>
                <td style={tdStyle}><input type="time" value={p.heureArrivee || ""} disabled={p.statut==="absent"} onChange={e => upsertPointage(agent.id, selectedDate, { heureArrivee: e.target.value })} style={inputStyle} /></td>
                <td style={tdStyle}><input type="time" value={p.heureDepart || ""} disabled={p.statut==="absent"} onChange={e => upsertPointage(agent.id, selectedDate, { heureDepart: e.target.value })} style={inputStyle} /></td>
                <td style={tdStyle}>
                  {p.statut === "absent"
                    ? <select value={p.justifie ? "oui" : "non"} onChange={e => upsertPointage(agent.id, selectedDate, { justifie: e.target.value === "oui" })} style={inputStyle}><option value="oui">Justifiée</option><option value="non">Non justifiée</option></select>
                    : <span style={{ color: "#999" }}>—</span>}
                </td>
                <td style={tdStyle}>
                  {c.estAbsent ? <span style={{ color: "#999" }}>—</span>
                    : c.retardMinutes > 0
                      ? <span style={{ background: "#FFF3CD", color: "#8a6500", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{c.retardMinutes} min</span>
                      : <span style={{ background: "#E6F4EC", color: "#1E7A4C", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>À l'heure</span>}
                </td>
                <td style={tdStyle}>
                  <b style={{ color: c.estAbsent ? "#B4322B" : "#1E7A4C" }}>{fmt(c.montantJour)}</b>
                  {!c.estAbsent && dtToUsd && devise === "DT" && <div style={{ fontSize: 10, color: "#999" }}>≈ {(c.montantJour * dtToUsd).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} USD</div>}
                </td>
                <td style={tdStyle}><input type="text" placeholder="Note..." value={p.notes || ""} onChange={e => upsertPointage(agent.id, selectedDate, { notes: e.target.value })} style={{ ...inputStyle, background: "white", color: "#1C1C1A", fontWeight: 400, width: 120 }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// GESTION DES AGENTS
// ============================================================
function AgentsPage({ agents, agentsRDC, agentsTN, addAgent, removeAgent }) {
  const [nom, setNom] = useState("");
  const [poste, setPoste] = useState("Agent de téléprospection");
  const [loc, setLoc] = useState("RDC");
  const [show, setShow] = useState(false);

  function submit() {
    if (!nom.trim()) return;
    addAgent(nom.trim(), poste, loc);
    setNom(""); setShow(false);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: "#0A1B3D" }}>Gestion des agents</h1>
        <button onClick={() => setShow(!show)} style={{ background: "#D4AF37", color: "#0A1B3D", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>+ Ajouter un agent</button>
      </div>

      {show && (
        <Panel title="Nouvel agent">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label style={labelStyle}>Nom complet</label><input type="text" value={nom} onChange={e => setNom(e.target.value)} style={{ ...inputStyle, width: 200, background: "white", color: "#1C1C1A" }} /></div>
            <div><label style={labelStyle}>Poste</label>
              <select value={poste} onChange={e => setPoste(e.target.value)} style={{ ...inputStyle, width: 200, background: "white", color: "#1C1C1A" }}>
                {["Agent de téléprospection","Gérant local délégué","Responsable production","Technicien informatique","Comptable/RH","Avocat","Femme de ménage","Maintenancier","Autre"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Localisation</label>
              <select value={loc} onChange={e => setLoc(e.target.value)} style={{ ...inputStyle, background: "white", color: "#1C1C1A" }}>
                <option value="RDC">🇨🇩 Kinshasa — RDC</option>
                <option value="TN">🇹🇳 Tunisie</option>
              </select>
            </div>
            <button onClick={submit} style={{ background: "#0A1B3D", color: "white", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Ajouter</button>
          </div>
        </Panel>
      )}

      <Panel title={`🇨🇩 Agents Kinshasa — RDC (${agentsRDC.length})`} color="#1B3A6B">
        {agentsRDC.length === 0 ? <Empty text="Aucun agent RDC enregistré." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Nom","Poste","Localisation",""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {agentsRDC.map(a => (
                <tr key={a.id}>
                  <td style={tdStyle}><b>{a.nom}</b></td>
                  <td style={tdStyle}>{a.poste}</td>
                  <td style={tdStyle}><span style={{ background: "#E6F4EC", color: "#1E7A4C", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>🇨🇩 RDC</span></td>
                  <td style={tdStyle}><button onClick={() => removeAgent(a.id)} style={{ background: "#FBE9E7", color: "#B4322B", border: "none", padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title={`🇹🇳 Agents Tunisie (${agentsTN.length})`} color="#8a6500">
        {agentsTN.length === 0 ? <Empty text="Aucun agent Tunisie enregistré." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Nom","Poste","Localisation",""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {agentsTN.map(a => (
                <tr key={a.id}>
                  <td style={tdStyle}><b>{a.nom}</b></td>
                  <td style={tdStyle}>{a.poste}</td>
                  <td style={tdStyle}><span style={{ background: "#FFF3CD", color: "#8a6500", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>🇹🇳 Tunisie</span></td>
                  <td style={tdStyle}><button onClick={() => removeAgent(a.id)} style={{ background: "#FBE9E7", color: "#B4322B", border: "none", padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

// ============================================================
// PARAMÈTRES MENSUELS
// ============================================================
function ParamsPage({ agents, agentsRDC, agentsTN, selectedDate, setSelectedDate, getMonthParam, setMonthParam, dtToUsd, setDtToUsd, onChangePassword }) {
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [newPw2, setNewPw2] = useState(""); const [msg, setMsg] = useState("");

  async function submitPw() {
    if (newPw.length < 4) { setMsg("Minimum 4 caractères."); return; }
    if (newPw !== newPw2) { setMsg("Les mots de passe ne correspondent pas."); return; }
    const ok = await onChangePassword(oldPw, newPw);
    setMsg(ok ? "✓ Mot de passe modifié." : "Ancien mot de passe incorrect.");
    if (ok) { setOldPw(""); setNewPw(""); setNewPw2(""); }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: "#0A1B3D" }}>Paramètres mensuels</h1>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "white", border: "1px solid #E4E1D8", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#0A1B3D" }} />
      </div>

      {/* Taux DT/USD */}
      <Panel title="💱 Taux de change DT → USD (mettre à jour chaque semaine)">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={labelStyle}>1 DT =</label>
          <input type="number" step="0.001" value={dtToUsd} onChange={e => setDtToUsd(parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 100 }} />
          <span style={{ fontSize: 12, color: "#6B6B63" }}>USD (source : Forex ou banque du jour)</span>
        </div>
      </Panel>

      {/* Salaires RDC */}
      <Panel title="🇨🇩 Salaires & Primes — Agents RDC (USD) — Début de mois : salaire fixe / Fin de mois : primes" color="#1B3A6B">
        <div style={{ fontSize: 11, color: "#6B6B63", marginBottom: 12 }}>⚠️ Les charges sociales (CNSS, INPP, ONEM, IPR) sont visibles dans le Récapitulatif — elles ne sont PAS déduites du salaire de l'agent.</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Agent","Poste","Salaire fixe (USD/mois)","Prime assiduité (USD)","Prime performance (USD)"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {agentsRDC.map(agent => {
              const mp = getMonthParam(agent.id, selectedDate);
              return (
                <tr key={agent.id}>
                  <td style={tdStyle}><b>{agent.nom}</b></td>
                  <td style={tdStyle}>{agent.poste}</td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.salaireFixe} onChange={e => setMonthParam(agent.id, selectedDate, { salaireFixe: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 90 }} /> USD</div></td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.primeAssiduite} onChange={e => setMonthParam(agent.id, selectedDate, { primeAssiduite: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 80 }} /> USD</div></td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.primePerformance} onChange={e => setMonthParam(agent.id, selectedDate, { primePerformance: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 80 }} /> USD</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* Salaires Tunisie */}
      <Panel title="🇹🇳 Salaires & Primes — Agents Tunisie (DT) — Aucune charge sociale" color="#8a6500">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Agent","Poste","Salaire fixe (DT/mois)","Prime assiduité (DT)","Prime performance (DT)"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {agentsTN.map(agent => {
              const mp = getMonthParam(agent.id, selectedDate);
              return (
                <tr key={agent.id}>
                  <td style={tdStyle}><b>{agent.nom}</b></td>
                  <td style={tdStyle}>{agent.poste}</td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.salaireFixe} onChange={e => setMonthParam(agent.id, selectedDate, { salaireFixe: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 90 }} /> DT</div></td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.primeAssiduite} onChange={e => setMonthParam(agent.id, selectedDate, { primeAssiduite: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 80 }} /> DT</div></td>
                  <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.primePerformance} onChange={e => setMonthParam(agent.id, selectedDate, { primePerformance: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 80 }} /> DT</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* Mot de passe */}
      <Panel title="🔒 Changer le mot de passe">
        <div style={{ maxWidth: 320 }}>
          {[["Mot de passe actuel", oldPw, setOldPw],["Nouveau mot de passe", newPw, setNewPw],["Confirme le nouveau", newPw2, setNewPw2]].map(([label, val, setter]) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{label}</label>
              <input type="password" value={val} onChange={e => setter(e.target.value)} style={{ ...inputStyle, width: "100%", background: "white", color: "#1C1C1A" }} />
            </div>
          ))}
          {msg && <div style={{ fontSize: 12, color: msg.startsWith("✓") ? "#1E7A4C" : "#B4322B", marginBottom: 10 }}>{msg}</div>}
          <button onClick={submitPw} style={{ background: "#0A1B3D", color: "white", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Modifier</button>
        </div>
      </Panel>
    </>
  );
}

// ============================================================
// RÉCAPITULATIF MENSUEL
// ============================================================
function RecapPage({ agents, agentsRDC, agentsTN, selectedDate, setSelectedDate, recapMensuelRDC, recapMensuelTN, dtToUsd }) {
  const monthLabel = new Date(selectedDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: "#0A1B3D" }}>Récapitulatif — {monthLabel}</h1>
          <div style={{ fontSize: 12.5, color: "#6B6B63", marginTop: 3 }}>Salaires nets + charges sociales séparées</div>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "white", border: "1px solid #E4E1D8", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#0A1B3D" }} />
      </div>

      {/* RDC */}
      <Panel title="🇨🇩 Agents RDC — Ce que l'agent reçoit (USD)" color="#1B3A6B">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Agent","Jours présents","Absences NJ","Retard cumulé","Fixe accumulé","Prime assiduité","Prime performance","NET versé à l'agent"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {agentsRDC.map(agent => {
                const r = recapMensuelRDC(agent.id, selectedDate);
                return (
                  <tr key={agent.id}>
                    <td style={tdStyle}><b>{agent.nom}</b></td>
                    <td style={tdStyle}>{r.joursP}</td>
                    <td style={tdStyle}><span style={{ background: r.absNJ >= 2 ? "#FBE9E7" : "#E6F4EC", color: r.absNJ >= 2 ? "#B4322B" : "#1E7A4C", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{r.absNJ}</span></td>
                    <td style={tdStyle}>{r.retardTotal} min</td>
                    <td style={tdStyle}>{r.totalFixe.toFixed(2)} USD</td>
                    <td style={tdStyle}>{r.primeAss.toFixed(2)} USD</td>
                    <td style={tdStyle}>{r.primePerf.toFixed(2)} USD</td>
                    <td style={tdStyle}><b style={{ color: "#1E7A4C", fontSize: 13 }}>{r.netAgent.toFixed(2)} USD</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Charges sociales RDC — séparées */}
      <Panel title="🏛 Charges sociales RDC — À payer par ASK GROUP (séparément du salaire)" color="#B4322B">
        <div style={{ fontSize: 11, color: "#6B6B63", marginBottom: 10 }}>Ces montants sont à la charge de la société — l'agent ne les voit pas et ne les paie pas.</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Agent","CNSS salarié (5%)","IPR (15%)","CNSS patronal (13%)","INPP (3%)","ONEM (2%)","Total charges société"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {agentsRDC.map(agent => {
                const r = recapMensuelRDC(agent.id, selectedDate);
                return (
                  <tr key={agent.id}>
                    <td style={tdStyle}><b>{agent.nom}</b></td>
                    <td style={{ ...tdStyle, color: "#B4322B" }}>{r.cnssSal.toFixed(2)} USD</td>
                    <td style={{ ...tdStyle, color: "#B4322B" }}>{r.ipr.toFixed(2)} USD</td>
                    <td style={{ ...tdStyle, color: "#FD7E14" }}>{r.cnssPat.toFixed(2)} USD</td>
                    <td style={{ ...tdStyle, color: "#FD7E14" }}>{r.inpp.toFixed(2)} USD</td>
                    <td style={{ ...tdStyle, color: "#FD7E14" }}>{r.onem.toFixed(2)} USD</td>
                    <td style={tdStyle}><b>{r.chargesSocietes.toFixed(2)} USD</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Tunisie */}
      {agentsTN.length > 0 && (
        <Panel title="🇹🇳 Agents Tunisie — Ce que l'agent reçoit (DT)" color="#8a6500">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{["Agent","Jours présents","Retard cumulé","Fixe accumulé","Prime assiduité","Prime performance","NET en DT","Équivalent USD"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {agentsTN.map(agent => {
                  const r = recapMensuelTN(agent.id, selectedDate);
                  return (
                    <tr key={agent.id}>
                      <td style={tdStyle}><b>{agent.nom}</b></td>
                      <td style={tdStyle}>{r.joursP}</td>
                      <td style={tdStyle}>{r.retardTotal} min</td>
                      <td style={tdStyle}>{r.totalFixe.toFixed(2)} DT</td>
                      <td style={tdStyle}>{r.primeAss.toFixed(2)} DT</td>
                      <td style={tdStyle}>{r.primePerf.toFixed(2)} DT</td>
                      <td style={tdStyle}><b style={{ color: "#8a6500", fontSize: 13 }}>{r.netDT.toFixed(2)} DT</b></td>
                      <td style={tdStyle}><b style={{ color: "#1E7A4C" }}>{r.netUSD.toFixed(2)} USD</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "#6B6B63", marginTop: 8 }}>Aucune charge sociale applicable pour les agents en Tunisie.</div>
        </Panel>
      )}
    </>
  );
}

// ============================================================
// ÉCRANS CONNEXION
// ============================================================
function SetupScreen({ newPw, setNewPw, newPw2, setNewPw2, onSubmit, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 36, width: 380 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 700, textAlign: "center" }}>ASK GROUP SARL</div>
        <h1 style={{ fontSize: 20, textAlign: "center", color: NAVY, margin: "8px 0 20px" }}>Suivi RH — Première utilisation</h1>
        <label style={labelStyle}>Nouveau mot de passe partagé</label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={loginInputStyle} placeholder="Toi et Jérémie l'utiliserez" />
        <label style={{ ...labelStyle, marginTop: 10 }}>Confirme le mot de passe</label>
        <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={loginInputStyle} />
        {error && <div style={{ color: "#B4322B", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={onSubmit} style={{ width: "100%", background: GOLD, color: NAVY, border: "none", padding: 12, borderRadius: 8, fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>Créer le mot de passe</button>
      </div>
    </div>
  );
}

function LoginScreen({ pwInput, setPwInput, onSubmit, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 36, width: 360 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 700, textAlign: "center" }}>ASK GROUP SARL</div>
        <h1 style={{ fontSize: 20, textAlign: "center", color: NAVY, margin: "8px 0 20px" }}>🔒 Suivi RH</h1>
        <label style={labelStyle}>Mot de passe</label>
        <input type="password" value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSubmit()} style={loginInputStyle} placeholder="Saisis le mot de passe" autoFocus />
        {error && <div style={{ color: "#B4322B", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={onSubmit} style={{ width: "100%", background: GOLD, color: NAVY, border: "none", padding: 12, borderRadius: 8, fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>Déverrouiller</button>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANTS UTILITAIRES
// ============================================================
function Panel({ title, children, color = "#1B3A6B" }) {
  return (
    <div style={{ background: "white", border: "1px solid #E4E1D8", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E4E1D8", borderLeft: `4px solid ${color}` }}>
        <h2 style={{ fontSize: 14, margin: 0, fontWeight: 700, color: "#0A1B3D" }}>{title}</h2>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: "white", border: "1px solid #E4E1D8", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#6B6B63", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: color || "#0A1B3D" }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: "center", padding: "20px", color: "#999", fontSize: 13 }}>{text}</div>;
}

const tdStyle = { padding: "8px 10px", borderBottom: "1px solid #E4E1D8" };
const thStyle = { textAlign: "left", padding: "8px 10px", background: "#FAFAF7", color: "#6B6B63", fontWeight: 600, fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid #E4E1D8", whiteSpace: "nowrap" };
const inputStyle = { border: "1px solid #E4E1D8", borderRadius: 5, padding: "5px 7px", fontSize: 12, background: "#EAF1FF", color: "#1A4FB4", fontWeight: 600 };
const loginInputStyle = { width: "100%", border: "1px solid #E4E1D8", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginTop: 4, boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B6B63", marginBottom: 4 };
