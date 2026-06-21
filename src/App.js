import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ASK GROUP SARL — LOGICIEL DE SUIVI RH (version Supabase)
// Connecté à une base de données partagée — Toi + Jérémie en temps réel
// ============================================================

const SUPABASE_URL = "https://sfuuzluaysxrdcqtvuto.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdXV6bHVheXN4cmRjcXR2dXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTU2OTEsImV4cCI6MjA5NzU5MTY5MX0.2N6_dYs56LLV6hLLkxippeyxrMNSp9VlBUt_GUdEdcM";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NAVY = "#0A1B3D";
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F2E2A8";
const APP_NAME = "suivi_rh";

function uid() { return Math.random().toString(36).slice(2, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr) { return dateStr.slice(0, 7); }

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

function formatUSD(n) {
  if (n === null || n === undefined || isNaN(n)) return "0.00 USD";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USD";
}

const HEURE_DEBUT = "09:00";
const HEURES_TRAVAIL_JOUR = 8;

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [storedPassword, setStoredPassword] = useState(null);
  const [setupMode, setSetupMode] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [page, setPage] = useState("pointage");
  const [agents, setAgents] = useState([]);
  const [pointages, setPointages] = useState([]);
  const [monthParams, setMonthParams] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loaded, setLoaded] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPoste, setNewAgentPoste] = useState("Agent de téléprospection");
  const [saveStatus, setSaveStatus] = useState("");
  const [connError, setConnError] = useState("");

  // ─── Vérifier le mot de passe au démarrage ──────────────────
  useEffect(() => {
    async function checkPassword() {
      const { data, error } = await supabase.from("app_passwords").select("*").eq("app_name", APP_NAME).maybeSingle();
      if (error) { setConnError("Erreur de connexion à la base de données : " + error.message); return; }
      if (data) setStoredPassword(data.password);
      else setSetupMode(true);
    }
    checkPassword();
  }, []);

  // ─── Charger toutes les données une fois déverrouillé ───────
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
      if (mp.data) setMonthParams(mp.data.map(x => ({ ...x, agentId: x.agent_id, salaireFixe: x.salaire_fixe, primePerformance: x.prime_performance })));
      setLoaded(true);
    }
    loadAll();

    // Rafraîchir automatiquement toutes les 8 secondes pour voir les changements de l'autre personne
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [unlocked]);

  async function handleSetupPassword() {
    if (newPw.length < 4) { setPwError("Le mot de passe doit faire au moins 4 caractères."); return; }
    if (newPw !== newPw2) { setPwError("Les deux mots de passe ne correspondent pas."); return; }
    const { error } = await supabase.from("app_passwords").insert({ app_name: APP_NAME, password: newPw });
    if (error) { setPwError("Erreur : " + error.message); return; }
    setStoredPassword(newPw);
    setSetupMode(false);
    setUnlocked(true);
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

  // ─── Gestion des agents ──────────────────────────────────────
  async function addAgent() {
    if (!newAgentName.trim()) return;
    const newAgent = { id: uid(), nom: newAgentName.trim(), poste: newAgentPoste };
    const { error } = await supabase.from("agents").insert(newAgent);
    if (!error) {
      setAgents([...agents, newAgent]);
      setNewAgentName("");
      setShowAddAgent(false);
    }
  }

  async function removeAgent(id) {
    if (!confirm("Supprimer cet agent ? Son historique de pointage sera aussi supprimé.")) return;
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

    setPointages(prev => {
      if (existing) return prev.map(p => p.id === existing.id ? merged : p);
      return [...prev, merged];
    });

    const dbRow = {
      id: merged.id, agent_id: merged.agentId, date: merged.date,
      heure_arrivee: merged.heureArrivee, heure_depart: merged.heureDepart,
      statut: merged.statut, justifie: merged.justifie, notes: merged.notes,
    };
    setSaveStatus("Enregistrement...");
    const { error } = await supabase.from("pointages").upsert(dbRow);
    setSaveStatus(error ? "Erreur de sauvegarde" : "Enregistré ✓");
    setTimeout(() => setSaveStatus(""), 1500);
  }

  function getMonthParam(agentId, date) {
    const mk = monthKey(date);
    const found = monthParams.find(m => m.agentId === agentId && m.mois === mk);
    return found || { salaireFixe: 150, primePerformance: 0 };
  }

  async function setMonthParam(agentId, date, updates) {
    const mk = monthKey(date);
    const existing = monthParams.find(m => m.agentId === agentId && m.mois === mk);
    const base = existing || { id: uid(), agentId, mois: mk, salaireFixe: 150, primePerformance: 0 };
    const merged = { ...base, ...updates };

    setMonthParams(prev => {
      if (existing) return prev.map(m => m.id === existing.id ? merged : m);
      return [...prev, merged];
    });

    await supabase.from("month_params").upsert({
      id: merged.id, agent_id: merged.agentId, mois: merged.mois,
      salaire_fixe: merged.salaireFixe, prime_performance: merged.primePerformance,
    });
  }

  // ─── LOGIQUE DE CALCUL DU SALAIRE JOURNALIER ────────────────
  function calculDuJour(agentId, date) {
    const pointage = getPointage(agentId, date);
    const mp = getMonthParam(agentId, date);
    const [year, month] = date.split("-").map(Number);
    const jOuvrables = joursOuvrables(year, month);
    const fixeJournalier = mp.salaireFixe / jOuvrables;

    if (!pointage || pointage.statut === "absent") {
      return { fixeJournalier: 0, deductionRetard: 0, montantJour: 0, retardMinutes: 0, estAbsent: true, justifie: pointage ? pointage.justifie : false };
    }

    const arriveeMin = timeToMinutes(pointage.heureArrivee);
    const debutMin = timeToMinutes(HEURE_DEBUT);
    let retardMinutes = 0;
    if (arriveeMin && arriveeMin > debutMin) retardMinutes = arriveeMin - debutMin;

    const tauxParMinute = fixeJournalier / (HEURES_TRAVAIL_JOUR * 60);
    const deductionRetard = retardMinutes * tauxParMinute;
    const montantJour = Math.max(0, fixeJournalier - deductionRetard);

    return { fixeJournalier, deductionRetard, montantJour, retardMinutes, estAbsent: false, justifie: true };
  }

  function absencesNonJustifieesDuMois(agentId, date) {
    const mk = monthKey(date);
    return pointages.filter(p => p.agentId === agentId && monthKey(p.date) === mk && p.statut === "absent" && !p.justifie).length;
  }

  function recapMensuel(agentId, date) {
    const mk = monthKey(date);
    const pointagesMois = pointages.filter(p => p.agentId === agentId && monthKey(p.date) === mk);
    let totalMontant = 0, totalRetardMin = 0, joursPresents = 0, joursAbsents = 0, absNonJust = 0;

    pointagesMois.forEach(p => {
      const calc = calculDuJour(agentId, p.date);
      totalMontant += calc.montantJour;
      totalRetardMin += calc.retardMinutes;
      if (p.statut === "absent") { joursAbsents++; if (!p.justifie) absNonJust++; }
      else joursPresents++;
    });

    const primeAssOK = absNonJust < 2;
    const mp = getMonthParam(agentId, date);
    const primeAssiduite = primeAssOK ? 25 : 0;
    const primePerf = mp.primePerformance || 0;

    return { totalFixeAccumule: totalMontant, joursPresents, joursAbsents, absNonJust, totalRetardMin, primeAssiduite, primeAssOK, primePerf, totalAvecPrimes: totalMontant + primeAssiduite + primePerf };
  }

  const todayPointages = agents.map(a => ({ agent: a, pointage: getPointage(a.id, selectedDate), calc: calculDuJour(a.id, selectedDate) }));
  const presentsToday = todayPointages.filter(t => t.pointage && t.pointage.statut === "present").length;
  const absentsToday = todayPointages.filter(t => t.pointage && t.pointage.statut === "absent").length;
  const nonSaisisToday = todayPointages.filter(t => !t.pointage).length;

  if (connError) {
    return <div style={{ padding: 40, fontFamily: "sans-serif", color: "#B4322B" }}>⚠️ {connError}</div>;
  }

  if (setupMode) {
    return <SetupPasswordScreen newPw={newPw} setNewPw={setNewPw} newPw2={newPw2} setNewPw2={setNewPw2} onSubmit={handleSetupPassword} error={pwError} />;
  }

  if (!unlocked) {
    return <LoginScreen pwInput={pwInput} setPwInput={setPwInput} onSubmit={handleUnlock} error={pwError} />;
  }

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: "sans-serif", color: NAVY }}>Chargement des données partagées...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", background: "#F6F5F1", color: "#1C1C1A" }}>
      <div style={{ width: 230, background: NAVY, color: "white", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 24px 24px", borderBottom: "1px solid rgba(255,255,255,.1)", marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 600 }}>ASK GROUP</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>Suivi RH</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>🟢 Connecté — Données partagées</div>
        </div>
        {[["pointage", "Pointage du jour"], ["agents", "Liste des agents"], ["recap", "Récapitulatif mensuel"]].map(([key, label]) => (
          <div key={key} onClick={() => setPage(key)} style={{
            padding: "13px 24px", fontSize: 13, cursor: "pointer",
            borderLeft: page === key ? `3px solid ${GOLD}` : "3px solid transparent",
            background: page === key ? "rgba(212,175,55,.12)" : "transparent",
            color: page === key ? GOLD_LIGHT : "rgba(255,255,255,.65)",
            fontWeight: page === key ? 600 : 400,
          }}>{label}</div>
        ))}
        <div style={{ margin: "24px 24px 0", padding: 12, background: "rgba(255,255,255,.06)", borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,.7)" }}>
          {saveStatus && <div style={{ color: "#8FD9B0", fontWeight: 600 }}>{saveStatus}</div>}
        </div>
        <div style={{ margin: "12px 24px 0" }}>
          <button onClick={() => setUnlocked(false)} style={{ width: "100%", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)", border: "none", padding: "10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔒 Verrouiller</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "28px 36px", maxWidth: 1300, overflowX: "auto" }}>
        {page === "pointage" && (
          <PointagePage agents={agents} selectedDate={selectedDate} setSelectedDate={setSelectedDate} getPointage={getPointage} upsertPointage={upsertPointage} calculDuJour={calculDuJour} presentsToday={presentsToday} absentsToday={absentsToday} nonSaisisToday={nonSaisisToday} />
        )}
        {page === "agents" && (
          <AgentsPage agents={agents} removeAgent={removeAgent} showAddAgent={showAddAgent} setShowAddAgent={setShowAddAgent} newAgentName={newAgentName} setNewAgentName={setNewAgentName} newAgentPoste={newAgentPoste} setNewAgentPoste={setNewAgentPoste} addAgent={addAgent} getMonthParam={getMonthParam} setMonthParam={setMonthParam} selectedDate={selectedDate} onChangePassword={handleChangePassword} />
        )}
        {page === "recap" && (
          <RecapPage agents={agents} selectedDate={selectedDate} setSelectedDate={setSelectedDate} recapMensuel={recapMensuel} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// ÉCRANS DE CONNEXION
// ============================================================
function SetupPasswordScreen({ newPw, setNewPw, newPw2, setNewPw2, onSubmit, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 36, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 700, textAlign: "center" }}>ASK GROUP SARL</div>
        <h1 style={{ fontSize: 20, textAlign: "center", color: NAVY, margin: "8px 0 4px" }}>Suivi RH — Première utilisation</h1>
        <p style={{ fontSize: 12.5, color: "#6B6B63", textAlign: "center", marginBottom: 24 }}>Crée le mot de passe partagé. Toi et Jérémie l'utiliserez tous les deux.</p>
        <label style={labelStyle}>Nouveau mot de passe</label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={loginInputStyle} placeholder="Au moins 4 caractères" />
        <label style={{ ...labelStyle, marginTop: 12 }}>Confirme le mot de passe</label>
        <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={loginInputStyle} placeholder="Retape le mot de passe" />
        {error && <div style={{ color: "#B4322B", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={onSubmit} style={{ width: "100%", background: GOLD, color: NAVY, border: "none", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>Créer le mot de passe</button>
      </div>
    </div>
  );
}

function LoginScreen({ pwInput, setPwInput, onSubmit, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: 36, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 700, textAlign: "center" }}>ASK GROUP SARL</div>
        <h1 style={{ fontSize: 20, textAlign: "center", color: NAVY, margin: "8px 0 20px" }}>🔒 Suivi RH</h1>
        <label style={labelStyle}>Mot de passe</label>
        <input type="password" value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSubmit()} style={loginInputStyle} placeholder="Saisis le mot de passe" autoFocus />
        {error && <div style={{ color: "#B4322B", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={onSubmit} style={{ width: "100%", background: GOLD, color: NAVY, border: "none", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>Déverrouiller</button>
      </div>
    </div>
  );
}

// ============================================================
// PAGE : POINTAGE DU JOUR
// ============================================================
function PointagePage({ agents, selectedDate, setSelectedDate, getPointage, upsertPointage, calculDuJour, presentsToday, absentsToday, nonSaisisToday }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: NAVY }}>Pointage du jour</h1>
          <div style={{ fontSize: 12.5, color: "#6B6B63", marginTop: 3 }}>Saisis l'heure d'arrivée, l'heure de départ et le statut de chaque agent</div>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "white", border: "1px solid #E4E1D8", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: NAVY }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        <Kpi label="Agents au total" value={agents.length} />
        <Kpi label="Présents" value={presentsToday} color="#1E7A4C" />
        <Kpi label="Absents" value={absentsToday} color="#B4322B" />
        <Kpi label="Non saisis" value={nonSaisisToday} color="#8a6500" />
      </div>

      <Panel title={`Saisie d'assiduité — ${new Date(selectedDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><Th>Agent</Th><Th>Statut</Th><Th>Heure arrivée</Th><Th>Heure départ</Th><Th>Justifié ?</Th><Th>Retard</Th><Th>Montant du jour</Th><Th>Note</Th></tr></thead>
            <tbody>
              {agents.map(agent => {
                const p = getPointage(agent.id, selectedDate) || { statut: "present", heureArrivee: "", heureDepart: "", justifie: true, notes: "" };
                const calc = calculDuJour(agent.id, selectedDate);
                return (
                  <tr key={agent.id}>
                    <Td><b>{agent.nom}</b><div style={{ fontSize: 10, color: "#6B6B63" }}>{agent.poste}</div></Td>
                    <Td>
                      <select value={p.statut} onChange={e => upsertPointage(agent.id, selectedDate, { statut: e.target.value })} style={inputStyle}>
                        <option value="present">Présent</option><option value="absent">Absent</option>
                      </select>
                    </Td>
                    <Td><input type="time" value={p.heureArrivee} disabled={p.statut === "absent"} onChange={e => upsertPointage(agent.id, selectedDate, { heureArrivee: e.target.value })} style={inputStyle} /></Td>
                    <Td><input type="time" value={p.heureDepart} disabled={p.statut === "absent"} onChange={e => upsertPointage(agent.id, selectedDate, { heureDepart: e.target.value })} style={inputStyle} /></Td>
                    <Td>
                      {p.statut === "absent" ? (
                        <select value={p.justifie ? "oui" : "non"} onChange={e => upsertPointage(agent.id, selectedDate, { justifie: e.target.value === "oui" })} style={inputStyle}>
                          <option value="oui">Justifiée</option><option value="non">Non justifiée</option>
                        </select>
                      ) : <span style={{ color: "#999" }}>—</span>}
                    </Td>
                    <Td>{calc.estAbsent ? <span style={{ color: "#999" }}>—</span> : calc.retardMinutes > 0 ? <Badge color="#8a6500" bg="#FFF3CD">{calc.retardMinutes} min</Badge> : <Badge color="#1E7A4C" bg="#E6F4EC">À l'heure</Badge>}</Td>
                    <Td><b style={{ color: calc.estAbsent ? "#B4322B" : "#1E7A4C" }}>{formatUSD(calc.montantJour)}</b></Td>
                    <Td><input type="text" placeholder="Note..." value={p.notes || ""} onChange={e => upsertPointage(agent.id, selectedDate, { notes: e.target.value })} style={{ ...inputStyle, background: "white", color: "#1C1C1A", fontWeight: 400 }} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6B6B63", padding: "10px 0 0" }}>
          <span>🕐 Horaire de référence : 9h00 – 17h00 (8h/jour)</span>
          <span>💰 Le montant du retard est automatiquement déduit du salaire du jour</span>
        </div>
      </Panel>

      <div style={{ background: "#FFF8DC", border: "1px solid #E4E1D8", borderRadius: 10, padding: 14, fontSize: 12, color: NAVY }}>
        💡 <b>Rappel :</b> Si un agent atteint 2 absences <b>non justifiées</b> dans le mois, sa prime d'assiduité (25 USD) tombe à 0 pour tout le mois. Vérifiable dans "Récapitulatif mensuel".
      </div>
    </>
  );
}

// ============================================================
// PAGE : LISTE DES AGENTS
// ============================================================
function AgentsPage({ agents, removeAgent, showAddAgent, setShowAddAgent, newAgentName, setNewAgentName, newAgentPoste, setNewAgentPoste, addAgent, getMonthParam, setMonthParam, selectedDate, onChangePassword }) {
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [newPw2, setNewPw2] = useState(""); const [msg, setMsg] = useState("");
  const [showPwForm, setShowPwForm] = useState(false);

  async function submitPw() {
    if (newPw.length < 4) { setMsg("Le nouveau mot de passe doit faire au moins 4 caractères."); return; }
    if (newPw !== newPw2) { setMsg("Les deux nouveaux mots de passe ne correspondent pas."); return; }
    const ok = await onChangePassword(oldPw, newPw);
    if (ok) { setMsg("✓ Mot de passe modifié."); setOldPw(""); setNewPw(""); setNewPw2(""); }
    else setMsg("Ancien mot de passe incorrect.");
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: NAVY }}>Liste des agents</h1>
          <div style={{ fontSize: 12.5, color: "#6B6B63", marginTop: 3 }}>Gère les agents et leur salaire fixe mensuel</div>
        </div>
        <button onClick={() => setShowAddAgent(!showAddAgent)} style={{ background: GOLD, color: NAVY, padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>+ Ajouter un agent</button>
      </div>

      {showAddAgent && (
        <Panel title="Nouvel agent">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Nom complet</label>
              <input type="text" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Ex: Jean Kabila" style={{ ...inputStyle, background: "white", color: "#1C1C1A", width: "100%" }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Poste</label>
              <select value={newAgentPoste} onChange={e => setNewAgentPoste(e.target.value)} style={{ ...inputStyle, background: "white", color: "#1C1C1A", width: "100%" }}>
                <option>Agent de téléprospection</option><option>Gérant local délégué</option><option>Responsable production</option><option>Technicien informatique</option><option>Femme de ménage</option><option>Autre</option>
              </select>
            </div>
            <button onClick={addAgent} style={{ background: NAVY, color: "white", padding: "9px 18px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Ajouter</button>
          </div>
        </Panel>
      )}

      <Panel title="Salaire fixe mensuel — Modifiable chaque début de mois">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr><Th>Agent</Th><Th>Poste</Th><Th>Salaire fixe mensuel</Th><Th>Prime performance (manuelle)</Th><Th></Th></tr></thead>
          <tbody>
            {agents.map(agent => {
              const mp = getMonthParam(agent.id, selectedDate);
              return (
                <tr key={agent.id}>
                  <Td><b>{agent.nom}</b></Td>
                  <Td>{agent.poste}</Td>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.salaireFixe} onChange={e => setMonthParam(agent.id, selectedDate, { salaireFixe: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 90 }} /> USD / mois</div></Td>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="number" value={mp.primePerformance} onChange={e => setMonthParam(agent.id, selectedDate, { primePerformance: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 80 }} /> USD (max 25)</div></Td>
                  <Td><button onClick={() => removeAgent(agent.id)} style={{ background: "#FBE9E7", color: "#B4322B", border: "none", padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Retirer</button></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "#6B6B63", marginTop: 10 }}>💡 Le salaire fixe est divisé automatiquement par le nombre de jours ouvrables du mois.</div>
      </Panel>

      <Panel title="🔒 Mot de passe partagé">
        {!showPwForm ? (
          <button onClick={() => setShowPwForm(true)} style={{ background: NAVY, color: "white", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Changer le mot de passe</button>
        ) : (
          <div style={{ maxWidth: 320 }}>
            <label style={labelStyle}>Mot de passe actuel</label>
            <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 10, background: "white", color: "#1C1C1A" }} />
            <label style={labelStyle}>Nouveau mot de passe</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 10, background: "white", color: "#1C1C1A" }} />
            <label style={labelStyle}>Confirme le nouveau mot de passe</label>
            <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 14, background: "white", color: "#1C1C1A" }} />
            {msg && <div style={{ fontSize: 12, color: msg.startsWith("✓") ? "#1E7A4C" : "#B4322B", marginBottom: 10 }}>{msg}</div>}
            <button onClick={submitPw} style={{ background: GOLD, color: NAVY, border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Valider</button>
          </div>
        )}
      </Panel>
    </>
  );
}

// ============================================================
// PAGE : RÉCAPITULATIF MENSUEL
// ============================================================
function RecapPage({ agents, selectedDate, setSelectedDate, recapMensuel }) {
  const monthLabel = new Date(selectedDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, color: NAVY }}>Récapitulatif mensuel</h1>
          <div style={{ fontSize: 12.5, color: "#6B6B63", marginTop: 3 }}>Salaire accumulé jour par jour + primes — {monthLabel}</div>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "white", border: "1px solid #E4E1D8", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: NAVY }} />
      </div>

      <Panel title={`Synthèse par agent — ${monthLabel}`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><Th>Agent</Th><Th>Jours présents</Th><Th>Jours absents</Th><Th>Abs. non justifiées</Th><Th>Retard cumulé</Th><Th>Fixe accumulé</Th><Th>Prime assiduité</Th><Th>Prime performance</Th><Th>TOTAL DU MOIS</Th></tr></thead>
            <tbody>
              {agents.map(agent => {
                const r = recapMensuel(agent.id, selectedDate);
                return (
                  <tr key={agent.id}>
                    <Td><b>{agent.nom}</b></Td>
                    <Td>{r.joursPresents}</Td>
                    <Td>{r.joursAbsents}</Td>
                    <Td><Badge color={r.absNonJust >= 2 ? "#B4322B" : "#1E7A4C"} bg={r.absNonJust >= 2 ? "#FBE9E7" : "#E6F4EC"}>{r.absNonJust} / 2</Badge></Td>
                    <Td>{r.totalRetardMin} min</Td>
                    <Td>{formatUSD(r.totalFixeAccumule)}</Td>
                    <Td>{r.primeAssOK ? <Badge color="#1E7A4C" bg="#E6F4EC">{formatUSD(r.primeAssiduite)}</Badge> : <Badge color="#B4322B" bg="#FBE9E7">0.00 USD — Annulée</Badge>}</Td>
                    <Td>{formatUSD(r.primePerf)}</Td>
                    <Td><b style={{ color: NAVY, fontSize: 13.5 }}>{formatUSD(r.totalAvecPrimes)}</b></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div style={{ background: "#FFF8DC", border: "1px solid #E4E1D8", borderRadius: 10, padding: 14, fontSize: 12, color: NAVY }}>
        ⚠️ Pour les charges sociales (CNSS, INPP, ONEM, IPR), reporte le "TOTAL DU MOIS" dans le logiciel Comptabilité.
      </div>
    </>
  );
}

// ============================================================
// COMPOSANTS UTILITAIRES
// ============================================================
function Panel({ title, children }) {
  return (
    <div style={{ background: "white", border: "1px solid #E4E1D8", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E4E1D8" }}><h2 style={{ fontSize: 14.5, margin: 0, fontWeight: 700, color: NAVY }}>{title}</h2></div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}
function Kpi({ label, value, color }) {
  return (
    <div style={{ background: "white", border: "1px solid #E4E1D8", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#6B6B63", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: color || NAVY }}>{value}</div>
    </div>
  );
}
function Th({ children }) { return <th style={{ textAlign: "left", padding: "8px 10px", background: "#FAFAF7", color: "#6B6B63", fontWeight: 600, fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid #E4E1D8", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }) { return <td style={{ padding: "8px 10px", borderBottom: "1px solid #E4E1D8" }}>{children}</td>; }
function Badge({ children, color, bg }) { return <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, color, background: bg, display: "inline-block" }}>{children}</span>; }

const inputStyle = { border: "1px solid #E4E1D8", borderRadius: 5, padding: "5px 7px", fontSize: 12, background: "#EAF1FF", color: "#1A4FB4", fontWeight: 600 };
const loginInputStyle = { width: "100%", border: "1px solid #E4E1D8", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginTop: 4 };
const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B6B63", marginBottom: 4 };
