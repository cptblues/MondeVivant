# Petit Monde Vivant — Irrigation

Prototype TypeScript/Vite d’un jeu de restauration végétale.

## Boucle de jeu

1. Installer la pompe : elle remplit la réserve d’eau, humidifie quelques tuiles autour d’elle et sert de source au réseau.
2. Sélectionner **Tuyau**, cliquer sur la pompe puis sur une destination située à 14 cases maximum.
3. Cliquer sur une tuile du tuyau et y créer une sortie d’eau, puis ouvrir ou fermer sa vanne.
4. Scanner les sols. Les résultats restent mémorisés après le retrait du scanner.
5. Poser la pépinière : un petit robot apparaît et devient responsable des plantations.
6. Sélectionner une graine, peindre une zone de plantation, puis laisser le robot faire les allers-retours depuis la pépinière.
7. Utiliser la pépinière pour multiplier ou adapter les graines.
8. Laisser la mousse et l’herbe coloniser les tuiles humides.
9. À son stade 3, un arbre peut établir jusqu’à trois semis naturels autour de lui, à un moment aléatoire et uniquement dans les zones assez lumineuses.
10. Abattre un arbre mature pour récupérer du bois.
11. Construire une cuve relais : elle se remplit depuis un tuyau de pompe relié directement sur elle ou par robot transporteur, humidifie localement et peut devenir source d’un réseau secondaire.
12. Construire un atelier transporteur pour envoyer un robot remplir les cuves depuis la pompe.

## Lancer le projet

```bash
npm install
npm run dev
```

## Vérifier et compiler

```bash
npm run typecheck
npm run build
```
