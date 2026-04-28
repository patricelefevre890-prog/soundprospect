# SoundProspect 🎵

Application web d'**analyse de marché géolocalisée** pour les professionnels de la diffusion musicale (sonorisation, BGM, Soundtrack Business, etc.).

Entrez une ville ou un quartier → obtenez une liste de prospects triés par score d'intérêt, avec carte interactive.

---

## ✨ Fonctionnalités

- **Recherche par ville / quartier** avec rayon configurable (500 m → 5 km)
- **Score prospect automatique** basé sur 3 critères pondérés :
  - 🏢 **Surface** (25 %) — plus c'est grand, mieux c'est
  - 🏷️ **Secteur** (40 %) — favoris : horeca, commerces, coiffeurs
  - 🎶 **Probabilité de diffusion musicale** (35 %) — bars, boîtes de nuit, instituts beauté en tête
- **Carte interactive** avec marqueurs colorés (vert / orange / rouge)
- **Filtres rapides** : Horeca · Commerces · Autres
- **Fiche détail** par prospect (scores individuels, distance, adresse)
- **Mode sombre** natif (suit les préférences système)
- **100 % gratuit** — données OpenStreetMap via Overpass API, aucune clé API requise

---

## 🚀 Utilisation

L'application est un fichier HTML unique, **aucune installation nécessaire**.

### Option 1 — En local

```bash
git clone https://github.com/TON-USERNAME/soundprospect.git
cd soundprospect
# Ouvrir index.html dans ton navigateur
open index.html   # macOS
start index.html  # Windows
xdg-open index.html  # Linux
```

### Option 2 — GitHub Pages (recommandé)

1. Fork ou clone ce repo sur ton compte GitHub
2. Va dans **Settings → Pages**
3. Source : `Deploy from a branch` → branche `main` → dossier `/ (root)`
4. Ton app sera live sur `https://TON-USERNAME.github.io/soundprospect`

---

## 🧮 Détail du scoring

| Critère | Poids | Calcul |
|---------|-------|--------|
| Surface | 25 % | `min(100, surface_m² / 5)` — N/D → score par défaut 40 |
| Secteur | 40 % | Table fixe par type d'établissement (0–100) |
| Musique | 35 % | Probabilité estimée par type (0–99 %) |

**Score total** = `surface × 0.25 + secteur × 0.40 + musique × 0.35`

| Score | Couleur | Interprétation |
|-------|---------|----------------|
| ≥ 70  | 🟢 Vert | Prospect prioritaire |
| 45–69 | 🟡 Orange | Prospect intéressant |
| < 45  | 🔴 Rouge | Faible potentiel |

---

## 🗂️ Structure du projet

```
soundprospect/
└── index.html      # Application complète (HTML + CSS + JS, fichier unique)
```

---

## 🔧 Personnalisation

Les tables de scoring sont dans `index.html`, faciles à modifier :

```js
// Ajuster les scores par type d'établissement
const SECTOR_SCORES = {
  bar: 100,
  restaurant: 90,
  // ...
};

// Ajuster les probabilités de diffusion musicale
const MUSIC_PROB = {
  bar: 95,
  hairdresser: 90,
  // ...
};
```

---

## 📦 Dépendances

- [Leaflet.js](https://leafletjs.com/) v1.9.4 — carte interactive
- [OpenStreetMap](https://www.openstreetmap.org/) — fond de carte
- [Nominatim](https://nominatim.org/) — géocodage (ville → coordonnées)
- [Overpass API](https://overpass-api.de/) — données POI en temps réel

Toutes chargées via CDN, aucune installation npm requise.

---

## 📄 Licence

MIT — libre d'utilisation, modification et distribution.
