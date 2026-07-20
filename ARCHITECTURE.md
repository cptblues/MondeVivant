# Architecture

- `src/core/GameSimulation.ts` : façade publique de simulation utilisée par `main.ts`, le rendu et l’UI.
- `src/core/state.ts` : état mutable initial, inventaires, ressources et compteurs.
- `src/core/simulationContext.ts` : contrat interne partagé par les systèmes.
- `src/core/systems/` : règles de jeu découpées par domaine : bâtiments, tuyaux, écologie, pépinière, workers, progression et requêtes.
- `src/core/types.ts` : types du domaine et extensions de définitions configurables.
- `src/core/config.ts` : définitions lisibles des bâtiments, graines, terrains et libellés.
- `src/core/gameConfig.ts` : constantes d’équilibrage groupées pour irrigation, tuyaux, pépinière, workers et écologie.
- `src/core/terrain.ts` : génération de carte.
- `src/rendering/Renderer.ts` : façade Canvas et caméra.
- `src/rendering/systems/` : rendu terrain, tuyaux, entités, overlays, prévisualisations et helpers de dessin.
- `src/rendering/Camera.ts` : zoom et déplacement.
- `src/ui/UIController.ts` : façade DOM.
- `src/ui/systems/` : dock, HUD, objectifs, inspecteur, panneau pépinière et contrôles globaux.
- `src/main.ts` : boucle d’animation et interactions pointeur/clavier.
