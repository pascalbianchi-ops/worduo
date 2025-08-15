import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../lib/socket";

export default function Lobby() {
    const navigate = useNavigate();
    const [players, setPlayers] = useState<string[]>([]);
    const [pseudo, setPseudo] = useState("");

    useEffect(() => {
        // Réception de la liste des joueurs
        const onLobbyUpdate = (list: string[]) => setPlayers(list);

        // Quand le serveur dit "startGame"
        const onStartGame = ({ game }: { game: string }) => {
            navigate(`/game${game}`, {
                state: {
                    players,
                    selfName: pseudo
                }
            });
        };

        socket.on("lobbyUpdate", onLobbyUpdate);
        socket.on("startGame", onStartGame);

        return () => {
            socket.off("lobbyUpdate", onLobbyUpdate);
            socket.off("startGame", onStartGame);
        };
    }, [navigate, players, pseudo]);

    const handleJoin = () => {
        if (pseudo.trim()) {
            socket.emit("joinLobby", pseudo.trim());
        }
    };

    const handleStart = () => {
        socket.emit("startGame", { game: "1" });
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
            {!players.includes(pseudo) && (
                <div className="mb-4">
                    <input
                        type="text"
                        value={pseudo}
                        onChange={(e) => setPseudo(e.target.value)}
                        placeholder="Votre pseudo"
                        className="px-4 py-2 rounded text-black"
                    />
                    <button
                        onClick={handleJoin}
                        className="ml-2 px-4 py-2 bg-blue-500 rounded"
                    >
                        Rejoindre
                    </button>
                </div>
            )}

            <h2 className="text-xl mb-2">Joueurs dans le lobby :</h2>
            <ul>
                {players.map((p, i) => (
                    <li key={i}>{p}</li>
                ))}
            </ul>

            {players.length > 1 && (
                <button
                    onClick={handleStart}
                    className="mt-4 px-4 py-2 bg-green-500 rounded"
                >
                    Lancer la partie
                </button>
            )}
        </div>
    );
}
