# Concept de jeu — Pop Sauce amélioré (v2, règles fixées)

> Chaque mécanique tient en **une phrase** (en gras). Le reste ne sert qu'à préciser les cas particuliers.
> Toutes les mécaniques sauf le score de base s'activent ou se désactivent dans les **options de la salle**.

---

## 0. Déroulement d'un tour

1. **Phase de préparation (5 s)** : on mise, on charge son H3in, on propose une alliance.
2. **Question (10 s)** : un contenu apparaît, on tape la réponse.
3. **Résultat (3 s)** : la bonne réponse s'affiche, les points sont donnés, les effets se déclenchent.

Toutes les 5 questions : **mini-jeu**. Toutes les 15 questions : **manche Série**.

---

## 1. Score de base

**Points = précision × vitesse.**

| Précision | Points |
|---|---:|
| Réponse exacte (nom complet) | 10 |
| Réponse partielle (prénom ou nom seul) | 6 |
| Réponse approximative acceptée (petite faute) | 3 |
| Mauvaise réponse | 0 |

**Vitesse :** un multiplicateur s'affiche en direct et descend de **×2,0** (réponse immédiate) à **×1,0** (dernière seconde).

- Exemple : réponse exacte à mi-temps → 10 × 1,5 = **15 points**.
- Les points sont arrondis à l'entier le plus proche.
- On peut corriger sa réponse : une réponse partielle peut être complétée tant que le temps n'est pas écoulé. Seule la meilleure compte, avec le multiplicateur du moment où elle a été donnée.

**Champ de réponse :** il a toujours le focus. On tape directement, sans jamais cliquer.

---

## 2. Paris

**Pendant la préparation, tu mises des points : si tu marques à la question suivante, tu gagnes ta mise en plus, sinon tu la perds.**

- Mise libre, de 0 à la totalité de tes points.
- « Marquer » = n'importe quelle réponse qui rapporte des points (même partielle).
- Les mises sont cachées jusqu'au résultat.
- À 0 point, on ne peut pas miser.

---

## 3. Manche Série

**Toutes les 15 questions, 5 contenus déjà vus reviennent à la suite : retrouve-les.**

- Contenus choisis parmi ceux trouvés par **au moins la moitié des joueurs**.
- Présentés un par un, 5 s chacun, sans phase de préparation entre eux.
- Points normaux pour chaque contenu, et **+10 bonus** si tu trouves les 5.

---

## 4. Compensation (option, désactivée par défaut)

**Le leader gagne un peu moins, ceux qui sont loin derrière gagnent plus.**

| Situation | Gains |
|---|---:|
| Leader avec plus de 20 % d'avance sur le 2ᵉ | ×0,8 |
| Moins de la moitié des points du leader | ×1,5 |
| Dernier, avec moins de la moitié des points du leader | ×2,0 |
| Tous les autres | ×1,0 |

Un badge à côté du nom indique le multiplicateur actuel de chaque joueur.

---

## 5. Contenus spéciaux

**Un contenu marqué ✨ donne un effet au premier joueur qui le trouve.**

| Effet | Ce qui se passe |
|---|---|
| **Double** | Tes points à la question suivante sont ×2. |
| **Gel** | Les autres ne peuvent pas taper pendant les 3 premières secondes de la question suivante. |
| **Flou** | L'écran des autres est flouté pendant 3 s à la question suivante. |
| **Vol** | Tu prends 5 points au leader (ou au 2ᵉ si c'est toi le leader). |

Les créateurs peuvent attribuer n'importe quel effet à n'importe quel contenu dans le Content Studio, ou coder les leurs avec un script.

---

## 6. Mini-jeux

**Toutes les 5 questions, tout le monde joue un mini-jeu de 10 s : plus tu es bien classé, plus tu gagnes de points.**

| Classement | Points |
|---|---:|
| 1ᵉʳ | +10 |
| 2ᵉ | +6 |
| 3ᵉ | +3 |
| Participation | +1 |

Mini-jeux de départ : **Saisie rapide**, **Mémoire** (reproduire une séquence), **Timing** (appuyer au bon moment), **Mash**, **Labyrinthe**.

---

## 7. Alliances

**Tu proposes une alliance, l'autre accepte : pendant 3 questions, chacun gagne en bonus la moitié des points que l'autre marque.**

- Le bonus s'ajoute : on ne retire rien à son partenaire. Les deux ont donc intérêt à accepter.
- Bouton 🤝 sur le panneau de chaque joueur, utilisable à tout moment. L'alliance démarre à la question suivante.
- **5 propositions par partie**, et une seule alliance active à la fois.
- Le bonus d'alliance ne compte que les points de question (pas les paris, ni le H3in).

---

## 8. Équipes (mode de salle)

**Les joueurs forment des équipes de 2 à 4, et le score de l'équipe est la somme des scores de ses membres.**

- L'équipe avec le plus de points gagne.
- Les alliances sont désactivées dans ce mode, puisque l'équipe joue déjà ce rôle.
- On ne peut pas lancer son H3in sur un coéquipier.

---

## 9. H3in — le mauvais œil

**Tu sacrifies des points pour charger le mauvais œil. À ta prochaine bonne réponse, tu l'envoies sur quelqu'un : il perd ces points et toi tu les récupères.**

| Charge | Coût pour toi | Perte pour la cible |
|---|---:|---:|
| 1 | -5 | -5 |
| 2 | -10 | -10 |
| 3 | -20 | -20 |
| **Total** | **-35** | **-35** |

- **Charger :** touche **Suppr quand le champ de réponse est vide**, ou bouton 👁 sur ton panneau. 3 charges maximum.
- **Envoyer :** à ta prochaine réponse qui rapporte des points, tu as 3 s pour choisir ta cible (clic sur son panneau ou touches 1 à 9). Si tu ne choisis pas, la cible est le leader (ou le 2ᵉ si c'est toi le leader).
- **Risque :** si tu ne marques pas dans les **3 questions** qui suivent ta dernière charge, le H3in disparaît et tes points sacrifiés sont perdus.
- Une cible ne peut pas descendre sous 0 point.
- Tout le monde voit combien de charges chaque joueur a accumulées (👁×1, ×2, ×3) : la menace fait partie du jeu.

---

## 10. Ordre de calcul des points

Pour éviter toute ambiguïté, à chaque question :

1. Précision × vitesse
2. × effet Double
3. × compensation
4. + bonus d'alliance
5. ± pari
6. H3in envoyé ou reçu

---

## 11. Content Studio

**Un éditeur intégré pour créer ses propres questions et packs.**

- Contenu : image, audio ou script.
- Réponse principale, réponses partielles et formulations acceptées.
- Catégorie et effet spécial éventuel.
- Packs partagés par code ou par lien.

### 11.1. Scripts

**Un contenu peut être un script JavaScript sans aucune limite : il peut tout lire et tout modifier dans la partie.**

- Exemples : déplacer un personnage de A à B, inventer un mini-jeu, créer un effet spécial, modifier les règles d'une question.
- Une API simple est fournie (`game.players`, `game.addPoints()`, `game.onAnswer()`, `game.canvas`…), mais le script peut aller au-delà.
- ⚠️ Un script tourne directement dans le navigateur de chaque joueur. C'est fait pour jouer entre potes : ne charge que des packs de gens en qui tu as confiance.

---

## 12. Philosophie

Le cœur reste la reconnaissance de contenus. Quand on ne connaît pas la réponse, on peut quand même agir : miser, charger un H3in, proposer une alliance.

Deux réglages de salle prêts à l'emploi :

- **Classique** : score, paris, Série.
- **Chaos** : tout activé.
