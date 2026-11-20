# Guide : écrire un pack Hella Party (pour une autre IA, ex. ChatGPT)

Tu vas produire **un seul fichier `pack.json`** pour Hella Party, un quiz multijoueur où les joueurs voient une **image** et tapent la réponse le plus vite possible. Lis tout avant de commencer.

## 1. Format exact

```json
{
  "format": "hella-pack",
  "version": 1,
  "id": "celebrites",
  "name": "Célébrités",
  "emoji": "⭐",
  "author": "HKN",
  "prompt": "Qui est-ce ?",
  "tags": ["célébrités"],
  "aliasFrom": "src",
  "questions": [
    {
      "id": "c0001",
      "type": "image",
      "src": "wiki:en:Page_Wikipedia_anglaise_exacte",
      "answer": "Nom affiché à la révélation",
      "exact": ["variante 1", "variante 2", "surnom", "nom de famille seul"],
      "group": "Chanteurs",
      "difficulty": 1,
      "tags": ["célébrités", "chanteurs", "facile"],
      "explain": "Une phrase courte et fun (facultatif)."
    }
  ]
}
```

Champs :
- `id` du pack : minuscules, chiffres, tirets (`celebrites`). `id` des questions : uniques dans le pack (`c0001`, `c0002`…).
- `src` : **toujours** `wiki:en:<Titre exact de la page Wikipédia anglaise>` (espaces → `_`). Le serveur télécharge lui-même l'image principale de la page. N'invente jamais d'URL d'image.
- `answer` : le nom le plus connu en France.
- `exact` : **toutes** les autres réponses acceptées (voir §3). Plus il y en a, mieux c'est.
- `group` : la **sous-catégorie** (voir §2). Exactement une par question, orthographe identique partout.
- `difficulty` : 1 facile, 2 moyen, 3 difficile (voir §4). Mets aussi `facile` / `moyen` / `difficile` dans `tags`.
- `prompt` (facultatif, par question) : remplace « Qui est-ce ? » si besoin (ex. « Quel président ? »).

## 2. Sous-catégories (`group`)

Utilise ces noms (tu peux en ajouter si besoin, mais garde-les courts) :
Chanteurs · Rappeurs · Groupes de musique · Acteurs · Actrices · Réalisateurs · Humoristes · Youtubeurs & streamers · Sportifs : football · Sportifs : autres · Figures historiques · Présidents & chefs d'État · Dirigeants & politiques · Rois & reines · Scientifiques · Inventeurs & entrepreneurs · Écrivains · Peintres & artistes · Mannequins & personnalités TV.

Une personne = une seule question, dans son groupe principal.

## 3. Raccourcis (`exact`) : le plus important

Les joueurs tapent vite et mal. Pour chaque personne, mets dans `exact` :
- le nom complet, le **nom de famille seul** s'il est connu seul (« Zidane »), le prénom seul s'il est iconique (« Rihanna » est déjà le nom) ;
- les surnoms et noms de scène (« Zizou », « MJ », « CR7 », « Leo ») ;
- le vrai nom si c'est un nom de scène ;
- les orthographes courantes, avec et sans accents, tirets, apostrophes ;
- les initiales connues ;
- le nom en anglais s'il diffère.

Pas besoin des majuscules/accents/fautes de frappe : le jeu les tolère tout seul.

## 4. Difficulté = notoriété en France

- **1 facile** : tout le monde le reconnaît (stars mondiales, présidents récents, légendes du foot).
- **2 moyen** : connu des gens qui suivent le domaine.
- **3 difficile** : niche.
Vise environ 40 % facile, 35 % moyen, 25 % difficile.

## 5. Règles obligatoires

- **Uniquement des images** : pas de question texte, pas de rébus.
- L'image ne doit pas montrer le nom : choisis la page Wikipédia de la **personne** (son portrait), jamais celle d'un album, d'un film, d'une affiche ou d'un logo.
- Rien de sexuel, rien de choquant, pas de personnes connues uniquement pour un crime ou un drame.
- Pas de mineurs.
- Vérifie que chaque titre de page `wiki:en:` existe vraiment (titre exact de la page anglaise). Si tu n'es pas sûr, n'ajoute pas la personne.
- Pas de doublon de personne.

## 6. Taille

Jusqu'à **2 Mo** de JSON par pack (≈ 4 000 questions). S'il y en a plus, fais plusieurs packs (`celebrites-musique`, `celebrites-sport`…), même format.

## 7. Ce que tu rends

Uniquement le contenu de `pack.json`, JSON valide (pas de commentaires, pas de virgule finale). Si c'est long, découpe en plusieurs réponses que je recollerai, ou en plusieurs packs.

## 8. Pour le joueur (pas pour l'IA)

Studio (`/studio`) → **📥 Importer (.zip / .json)** → choisir le `pack.json` → vérifier quelques questions → **Publier en ligne**. Le pack apparaît dans le salon avec ses sous-catégories (▸).
