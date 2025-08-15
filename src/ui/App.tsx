import { useState } from "react";
import { Lobby } from "./Lobby";
import { Giver } from "./Giver";
import { Guesser } from "./Guesser";
import HomeScreen from "../Pages/HomeScreen";
import { useGame } from "../state/GameContext";

export function App() {
    const { state } = useGame();
    const [showHome, setShowHome] = useState(true);

    // 1) �cran d'accueil d'abord
    if (showHome) return <HomeScreen onStart={() => setShowHome(false)} />;

    // 2) Puis le Lobby tant que non rejoint
    if (!state.role || !state.roomId) return <Lobby />;

    // 3) �cran de jeu
    return state.role === "giver" ? <Giver /> : <Guesser />;
}

