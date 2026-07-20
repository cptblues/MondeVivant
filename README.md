# Petit Monde Vivant — Irrigation

Prototype TypeScript/Vite d’un jeu de restauration végétale.

## Boucle de jeu

1. Installer la pompe : elle remplit la réserve d’eau, humidifie quelques tuiles autour d’elle et sert de source au réseau.
2. Sélectionner **Tuyau**, cliquer sur la pompe puis sur une destination située à 14 cases maximum.
3. Cliquer sur une tuile du tuyau et y créer une sortie d’eau, puis ouvrir ou fermer sa vanne.
4. Poser la pépinière : un petit robot apparaît et devient responsable des scans, plantations et petits ravitaillements proches.
5. Délimiter une zone de scan : le robot rejoint la zone et mémorise les sols selon le nombre de tuiles à découvrir.
6. Sélectionner une graine, peindre une zone de plantation, puis laisser le robot faire les allers-retours depuis la pépinière.
7. Utiliser la pépinière pour multiplier ou adapter les graines. Si le stock de graines basiques tombe à zéro, elle peut envoyer le robot en chercher une sur la carte.
8. Laisser la mousse et l’herbe coloniser les tuiles humides.
9. À son stade 3, un arbre peut établir jusqu’à trois semis naturels autour de lui, à un moment aléatoire et uniquement dans les zones assez lumineuses.
10. Abattre un arbre mature pour récupérer du bois.
11. Construire une cuve relais : elle se remplit depuis un tuyau de pompe relié directement sur elle ou par le robot pépiniériste si elle est proche, humidifie localement en consommant son stock et peut devenir source d’un réseau secondaire.

## Lancer le projet

```bash
npm install
npm run dev
```

## Vérifier et compiler

```bash
npm run typecheck
npm test
npm run build
```
