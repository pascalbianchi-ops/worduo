// src/Pages/Home.tsx
import { Link } from "react-router-dom";

export default function Home() {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-6">
            <h1 className="text-3xl font-bold">Choisissez un jeu</h1>

            <div className="flex flex-col gap-4 w-full max-w-xs">
                {/* Jeu 1 → passe par le lobby et demande le pseudo */}
                <Link
                    to="/lobby?game=1"
                    className="w-full text-center bg-purple-600 px-6 py-3 rounded hover:bg-purple-700 transition"
                >
                    🎯 Jeu 1
                </Link>

                {/* Jeu 2 (à venir) → passera aussi par le lobby */}
                <Link
                    to="/lobby?game=2"
                    className="w-full text-center bg-blue-600 px-6 py-3 rounded hover:bg-blue-700 transition"
                >
                    🧩 Jeu 2 (bientôt)
                </Link>
            </div>
        </div>
    );
}
