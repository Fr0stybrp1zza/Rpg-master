import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, ScrollView, StatusBar, Text, View, Pressable,
  TextInput, Alert, ActivityIndicator
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { supabase } from "./src/supabase";

type Campaign = {
  id: string;
  name: string;
  status: "active" | "paused";
  accumulated_active_seconds: number;
  last_started_at: string | null;
};

type Character = {
  id: string;
  name: string;
  level: string | null;
  current_hp: number;
  max_hp: number;
  current_mana: number;
  max_mana: number;
  mana_regen_per_minute: number;
};

const colors = {
  bg: "#101216", panel: "#1B2028", panel2: "#242B35",
  text: "#F4F5F7", muted: "#A5AFBD", gold: "#D6A64D",
  blue: "#5B9BEB", green: "#54B887", red: "#E16C6C"
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

export default function App() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadCampaigns();
    else {
      setCampaigns([]);
      setSelectedCampaign(null);
      setCharacters([]);
    }
  }, [session]);

  useEffect(() => {
    if (!selectedCampaign) return;
    const update = () => {
      const base = selectedCampaign.accumulated_active_seconds;
      if (selectedCampaign.status !== "active" || !selectedCampaign.last_started_at) {
        setElapsed(base);
        return;
      }
      const started = new Date(selectedCampaign.last_started_at).getTime();
      setElapsed(base + Math.max(0, (Date.now() - started) / 1000));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [selectedCampaign]);

  async function loadCampaigns() {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id,name,status,accumulated_active_seconds,last_started_at")
      .order("created_at", { ascending: false });
    if (error) {
      Alert.alert("Não foi possível carregar", error.message);
      return;
    }
    setCampaigns((data ?? []) as Campaign[]);
  }

  async function openCampaign(campaign: Campaign) {
    setSelectedCampaign(campaign);
    const { data, error } = await supabase
      .from("characters")
      .select("id,name,level,current_hp,max_hp,current_mana,max_mana,mana_regen_per_minute")
      .eq("campaign_id", campaign.id)
      .order("name");
    if (error) {
      Alert.alert("Erro ao carregar fichas", error.message);
      return;
    }
    setCharacters((data ?? []) as Character[]);
  }

  async function createCampaign() {
    if (!newCampaignName.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ name: newCampaignName.trim(), owner_id: session.user.id })
      .select("id,name,status,accumulated_active_seconds,last_started_at")
      .single();
    setBusy(false);
    if (error) {
      Alert.alert("Erro ao criar campanha", error.message);
      return;
    }
    setNewCampaignName("");
    setCampaigns(prev => [data as Campaign, ...prev]);
  }

  async function toggleCampaign() {
    if (!selectedCampaign) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("toggle_campaign_clock", {
      p_campaign_id: selectedCampaign.id
    });
    setBusy(false);
    if (error) {
      Alert.alert("Não foi possível alterar o relógio", error.message);
      return;
    }
    const updated = data as Campaign;
    setSelectedCampaign(updated);
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email: userEmail.trim(), password
    });
    if (error) Alert.alert("Falha no login", error.message);
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email: userEmail.trim(), password
    });
    if (error) Alert.alert("Falha no cadastro", error.message);
    else Alert.alert("Cadastro enviado", "Se a confirmação por e-mail estiver ativada, confirme seu endereço antes de entrar.");
  }

  if (sessionLoading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.gold} /></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <ExpoStatusBar style="light" />
        <View style={styles.authBox}>
          <Text style={styles.logo}>RPG MASTER</Text>
          <Text style={styles.subtitle}>Gerencie campanhas, fichas e recursos.</Text>
          <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor={colors.muted}
            autoCapitalize="none" keyboardType="email-address" value={userEmail} onChangeText={setUserEmail} />
          <TextInput style={styles.input} placeholder="Senha" placeholderTextColor={colors.muted}
            secureTextEntry value={password} onChangeText={setPassword} />
          <ActionButton title="Entrar" onPress={signIn} />
          <ActionButton title="Criar conta" variant="secondary" onPress={signUp} />
          <Text style={styles.note}>Configure o Supabase antes de usar o login.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.logoSmall}>RPG MASTER</Text>
            <Text style={styles.subtitle}>{session.user.email}</Text>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.link}>Sair</Text></Pressable>
        </View>

        {!selectedCampaign ? (
          <>
            <Text style={styles.heading}>Minhas campanhas</Text>
            <View style={styles.panel}>
              <Text style={styles.label}>Nova campanha</Text>
              <TextInput style={styles.input} placeholder="Nome da campanha"
                placeholderTextColor={colors.muted} value={newCampaignName}
                onChangeText={setNewCampaignName} />
              <ActionButton title={busy ? "Criando..." : "Criar campanha"} onPress={createCampaign} disabled={busy} />
            </View>
            {campaigns.map(c => (
              <Pressable key={c.id} style={styles.campaignCard} onPress={() => openCampaign(c)}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                <Text style={styles.muted}>{c.status === "active" ? "Campanha ativa" : "Pausada"}</Text>
              </Pressable>
            ))}
            {campaigns.length === 0 && <Text style={styles.muted}>Você ainda não tem campanhas.</Text>}
          </>
        ) : (
          <>
            <Pressable onPress={() => { setSelectedCampaign(null); setCharacters([]); }}>
              <Text style={styles.link}>‹ Todas as campanhas</Text>
            </Pressable>
            <Text style={styles.heading}>{selectedCampaign.name}</Text>
            <View style={styles.clockCard}>
              <Text style={styles.label}>TEMPO ATIVO DA CAMPANHA</Text>
              <Text style={styles.clock}>{formatTime(elapsed)}</Text>
              <Text style={styles.muted}>{selectedCampaign.status === "active" ? "Relógio em andamento" : "Relógio pausado"}</Text>
              <ActionButton
                title={selectedCampaign.status === "active" ? "Pausar campanha" : "Iniciar campanha"}
                onPress={toggleCampaign} disabled={busy}
                variant={selectedCampaign.status === "active" ? "danger" : "primary"}
              />
            </View>
            <Text style={styles.heading}>Personagens</Text>
            {characters.map(ch => (
              <View key={ch.id} style={styles.characterCard}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{ch.name}</Text>
                  <Text style={styles.muted}>{ch.level ?? "Sem nível"}</Text>
                </View>
                <Resource label="Vida" current={ch.current_hp} max={ch.max_hp} color={colors.green} />
                <Resource label="Mana" current={ch.current_mana} max={ch.max_mana} color={colors.blue} />
                <Text style={styles.note}>Regeneração configurada: {ch.mana_regen_per_minute}/min</Text>
              </View>
            ))}
            {characters.length === 0 && <Text style={styles.muted}>Nenhum personagem cadastrado nesta campanha ainda.</Text>}
            <Text style={styles.note}>Próxima etapa: cadastro de personagens, convites e permissões de mestre/jogador.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Resource({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.resourceValue}>{current.toLocaleString("pt-BR")} / {max.toLocaleString("pt-BR")}</Text>
      </View>
      <View style={styles.track}><View style={{ width: `${ratio * 100}%`, height: 8, borderRadius: 8, backgroundColor: color }} /></View>
    </View>
  );
}

function ActionButton({ title, onPress, variant = "primary", disabled = false }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean
}) {
  const backgroundColor = variant === "primary" ? colors.gold : variant === "danger" ? "#8F4141" : colors.panel2;
  return (
    <Pressable disabled={disabled} onPress={onPress}
      style={[styles.button, { backgroundColor, opacity: disabled ? 0.55 : 1 }]}>
      <Text style={[styles.buttonText, variant === "primary" && { color: "#171717" }]}>{title}</Text>
    </Pressable>
  );
}

const styles: any = {
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48 },
  authBox: { flex: 1, justifyContent: "center", padding: 24 },
  logo: { color: colors.gold, fontSize: 32, fontWeight: "900", letterSpacing: 2 },
  logoSmall: { color: colors.gold, fontSize: 20, fontWeight: "900", letterSpacing: 1.5 },
  subtitle: { color: colors.muted, marginTop: 6, marginBottom: 18 },
  heading: { color: colors.text, fontSize: 23, fontWeight: "800", marginTop: 24, marginBottom: 14 },
  panel: { backgroundColor: colors.panel, borderRadius: 16, padding: 16, marginBottom: 16 },
  input: { backgroundColor: colors.panel2, color: colors.text, borderRadius: 10, padding: 14, marginTop: 10, marginBottom: 10 },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: colors.text, fontWeight: "800" },
  campaignCard: { backgroundColor: colors.panel, padding: 18, borderRadius: 14, marginBottom: 10 },
  characterCard: { backgroundColor: colors.panel, padding: 16, borderRadius: 14, marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
  muted: { color: colors.muted, marginTop: 5 },
  link: { color: colors.gold, fontWeight: "700", marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clockCard: { backgroundColor: colors.panel, padding: 20, borderRadius: 16, alignItems: "center" },
  clock: { color: colors.text, fontSize: 38, fontWeight: "900", fontVariant: ["tabular-nums"], marginVertical: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resourceValue: { color: colors.text, fontWeight: "700" },
  track: { height: 8, backgroundColor: colors.panel2, borderRadius: 8, marginTop: 7, overflow: "hidden" },
  note: { color: colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 }
};
