const BASE = "http://localhost:8000/api";

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const CURRENT_YEAR = new Date().getFullYear();

// --- Types ---

export interface Game {
  id: number;
  round: number;
  year: number;
  date: string | null;
  venue: string | null;
  hteam: string | null;
  ateam: string | null;
  hscore: number | null;
  ascore: number | null;
  complete: number;
}

export interface Prediction {
  game_id: number;
  date: string | null;
  venue: string | null;
  home_team: string;
  away_team: string;
  predicted_winner: string;
  predicted_loser: string;
  confidence: number;
  avg_margin: number;
  model_count: number;
  home_vote_pct: number;
  away_vote_pct: number;
  is_close: boolean;
  is_complete: boolean;
  actual_winner: string | null;
  home_score: number | null;
  away_score: number | null;
  tip_correct: boolean | null;
}

export interface FormData {
  win_rate: number;
  avg_margin: number;
  wins: number;
  losses: number;
  streak: number;
}

export interface ValueData {
  game_id: number;
  date: string | null;
  venue: string | null;
  home_team: string;
  away_team: string;
  predicted_winner: string;
  confidence: number;
  avg_margin: number;
  home_vote_pct: number;
  away_vote_pct: number;
  home_form: FormData;
  away_form: FormData;
  h2h: {
    games_played: number;
    home_wins: number;
    away_wins: number;
    avg_margin: number;
    home_win_rate: number;
  };
}

export interface TeamForm {
  team: string;
  games_analysed: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  avg_margin: number;
  avg_score_for: number;
  avg_score_against: number;
  streak: number;
}

export interface Standing {
  rank: number | null;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  percentage: number | null;
  pts: number | null;
}

export interface Source {
  id: number | null;
  name: string;
  url: string | null;
  correct: number | null;
  incorrect: number | null;
  accuracy: number | null;
}

// --- API calls ---

export const api = {
  currentRound: (year = CURRENT_YEAR) =>
    get<{ year: number; round: number }>("/games/current-round", { year }),

  games: (year = CURRENT_YEAR, round?: number) =>
    get<{ year: number; round: number; games: Game[] }>("/games", round ? { year, round } : { year }),

  predictions: (year = CURRENT_YEAR, round?: number) =>
    get<{ year: number; round: number; predictions: Prediction[] }>(
      "/tips/predictions",
      round ? { year, round } : { year }
    ),

  valueData: (year = CURRENT_YEAR, round?: number) =>
    get<{ year: number; round: number; value_data: ValueData[] }>(
      "/tips/value",
      round ? { year, round } : { year }
    ),

  form: (year = CURRENT_YEAR, last_n = 5) =>
    get<{ year: number; last_n: number; form: TeamForm[] }>("/form", { year, last_n }),

  h2h: (team_a: string, team_b: string, year = CURRENT_YEAR) =>
    get("/form/h2h", { team_a, team_b, year }),

  standings: (year = CURRENT_YEAR, round?: number) =>
    get<{ year: number; round: number; standings: Standing[] }>(
      "/standings",
      round ? { year, round } : { year }
    ),

  sources: () => get<{ sources: Source[] }>("/sources"),
};
