Prompt Claude Code — Backroom niveaux 1 et 2 (thème : la routine)
À déposer dans le repo pascalbianchi-ops/worduo, par exemple sous prompts/backroom-niveaux-1-2.md, puis demander à Claude Code : « Lis prompts/backroom-niveaux-1-2.md et applique-le ».
Contexte
Le mini-jeu secret Backroom (raycasting pixelisé, murs orange, contrôles tactiles iPhone : croix à gauche, bouton A = action) existe déjà et le niveau 1 est en production. Tu vas ajouter un système de jauges, des défis de logique et un niveau 2. Le thème de tout le jeu est la routine : la facilité (dopamine) ne mène nulle part, seul l'effort fait avancer.
Règles de travail
• Commence par lire le code existant du Backroom et résume-moi son architecture avant de modifier quoi que ce soit.
• Travaille sur une branche dédiée backroom-jauges, jamais directement sur main.
• Changements chirurgicaux : ne casse rien de ce qui fonctionne (Worduo, déclenchement par le mot « backroom », contrôles, rendu).
• Le jeu doit rester jouable sans son (usage mobile en public) : tout retour doit être visuel.
• Ne suppose rien sur ce que tu n'as pas vérifié dans le code : si un point est ambigu, demande-moi.
Les deux jauges (HUD)
• Jauge dopamine : pleine au départ, baisse en continu. Si elle tombe à zéro, la partie est perdue.
• Jauge effort : visible mais éteinte au départ. Elle s'allume au premier défi réussi. Au niveau 1, elle ne baisse jamais.
Objets dopamine
Burger, frites, soda, bonbons, donut, télévision, téléphone, manette de jeu, console portable (type Game Boy). Sprites en pixel art, lisibles à petite taille.
• Ramasser un objet (bouton action) redonne de la dopamine.
• Accoutumance : chaque objet ramassé rapporte moins que le précédent.
• Plafond à 90 % : la dopamine ne peut jamais dépasser 90 % grâce aux objets.
• La baisse de dopamine doit être plus rapide que le temps de marche entre deux objets : le joueur doit galérer un peu sans mourir avant d'atteindre la sortie.
• Placer beaucoup d'objets, toujours plus proches et plus visibles que les défis.
Défis d'effort (communs aux niveaux)
Chaque défi est une borne dans le labyrinthe. Bouton action devant la borne → fenêtre par-dessus le labyrinthe, texte bien lisible (pas forcément en pixel art), jouable au doigt, moins d'une minute.
• Défi réussi → la jauge d'effort augmente, petit gain de dopamine (la fierté), toujours plafonné à 90 %.
• Pendant un défi, la dopamine continue de baisser, mais lentement : la jauge d'effort, une fois allumée, freine fortement la baisse.
Niveau 1
Défis (3) :
1. Puzzle de rotation : grille 3×3 ou 4×4, chaque case porte un bout de trait. Les pièces ne se déplacent jamais : un tap = rotation d'un quart de tour. Gagné quand le cercle est reconstitué.
2. Suite logique de formes : trouver la forme suivante parmi plusieurs choix.
3. L'intrus : repérer l'élément qui n'a rien à faire dans un groupe.
Déroulé scénarisé :
• Au départ, aucun défi n'est accessible. Le début du parcours est plutôt linéaire, semé d'objets dopamine qui guident le joueur jusqu'à la porte de sortie.
• Porte verrouillée : bouton action devant la porte → la porte tremble à l'écran et la jauge dopamine s'affiche barrée. La règle n'est jamais expliquée.
• Le joueur repart chercher des objets, atteint ~90 %, retente la porte : échec, jauge barrée.
• À ce deuxième échec (à ~90 %), ouvrir en secret un passage vers le premier défi :
    ◦ tout près de la porte, dans un renfoncement que le joueur ne voit qu'en repartant de la porte (dans son dos quand il arrive) ;
    ◦ ouverture uniquement hors de son champ de vision ;
    ◦ une petite lueur bleue au fond du passage pour attirer son regard ;
    ◦ un objet dopamine bien voyant placé de façon à détourner l'attention. Le joueur doit croire que le passage a toujours existé.
• Premier défi réussi → la jauge d'effort s'allume, et une nouvelle zone s'ouvre avec d'autres objets dopamine et les défis suivants.
• À chaque essai à la porte, montrer la progression de la jauge d'effort.
• 3 défis réussis = jauge d'effort pleine → la porte s'ouvre → niveau 2.
Niveau 2 (même thème, plus dur)
Nouveauté : les objets dopamine viennent vers le joueur ou apparaissent sur son chemin. Le joueur doit les éviter. Au contact, l'objet est consommé automatiquement : gain de dopamine, mais il grignote la jauge d'effort.
Défis (4) :
1. Jeu des lumières : grille de cases, chaque tap inverse la case et ses voisines ; tout éteindre.
2. Allumettes : déplacer une seule allumette pour corriger une égalité.
3. La balance : déduire le poids d'un objet à partir de plusieurs pesées.
4. Code secret : trouver un code avec des indices du type « un chiffre bon mais mal placé ».
Sortie : une échelle avec seulement ses deux montants, sans barreaux. Bouton action devant → symbole échelle + jauge dopamine barrée. Quand la jauge d'effort est pleine, tous les barreaux apparaissent d'un coup, puis courte animation de transition vers le haut (le moteur ne gère pas la montée).
Tests autonomes
Comme pour le niveau 1 : joue toi-même avec Playwright (émulation WebKit/iPhone) et vérifie :
• qu'on ne peut jamais dépasser 90 % de dopamine avec les objets ;
• que la porte et l'échelle ne s'ouvrent jamais sans la jauge d'effort pleine ;
• que le passage secret s'ouvre au bon moment, hors champ ;
• que le niveau est faisable sans mourir pour un joueur qui ne traîne pas, et difficile pour celui qui ne fait que manger ;
• que chaque défi est jouable au doigt en moins d'une minute.
Ajuste les valeurs (vitesse de baisse, gains, accoutumance) pour tenir cet équilibre, puis donne-moi un résumé des valeurs retenues et une adresse de test via Tailscale avant toute fusion dans main.