# Cowen Dataset Processing & Emotion Regression Suite

This suite handles data ingestion, feature extraction (DSP and MERT audio representations), cross-validated regression modeling, and performance benchmarking on the Cowen et al. musical emotion stimuli dataset.

---

### Scripts Overview

* **`inspect.py`**: Explores the schema, data types, nested structures, and raw values of the Cowen dataset parquet/file.
* **`load_to_db.py`**: Parses the Cowen parquet dataset, extracts snippet paths, sanitizes mood labels, and loads metadata and scores into PostgreSQL (`cowen_dataset`).
* **`feature_extraction.py`**: Computes 18 handcrafted DSP audio features (e.g., MFCCs, energy, brightness, bassiness, rhythm ratio, vocal probability) from the dataset audio snippets.
* **`mert_extraction.py`**: Runs audio snippets through the pre-trained MERT model to extract mean-pooled 1024-dimensional acoustic/harmonic embeddings.
* **`regression.py`**: Trains $L_2$-regularized Ridge regression models (`RidgeCV`) using 5-fold cross-validation on DSP, MERT, or Hybrid feature sets to output mood projection weights and evaluate out-of-fold $R^2$ and RMSE.
* **`random_baseline.py`**: Evaluates statistical lower bounds (dummy estimators, permuted labels, and uniform random sampling) across all mood dimensions to verify whether learned features exceed chance.

---

### Prerequisites

Dataset expected to be located at `datasets/cowen.parquet`. Outputs are saved as csv to the same folder.

---

### Usage & Parameter Reference

#### `inspect.py`

* **Usage:**
```bash
uv run python -m src.scripts.cowen.inspect [PARQUET_PATH]

```


* **Parameters:**
* `PARQUET_PATH` *(optional)*: Path to the target `.parquet` file. Defaults to `datasets/cowen.parquet`.



---

#### `load_to_db.py`

* **Usage:**
```bash
uv run python -m src.scripts.cowen.load_to_db [PARQUET_PATH]

```


* **Parameters:**
* `PARQUET_PATH` *(optional)*: Path to the target `.parquet` file. Defaults to `datasets/cowen.parquet`.



---

#### `regression.py`

* **Usage:**
```bash
uv run python -m src.scripts.cowen.regression [MODE]

```


* **Modes / Positional Arguments:**
* `dsp`: Runs Ridge regression on the 18 handcrafted DSP features (`datasets/cowen_features.csv`). Output: `datasets/cowen_features_regression_weights.csv`. Default.
* `mert`: Runs Ridge regression on the 1024 MERT embeddings (`datasets/cowen_mert_embeddings.csv`). Output: `datasets/cowen_mert_regression_weights.csv`.
* `hybrid`: Merges DSP and MERT matrices (1042 total features) and fits a combined model. Output: `datasets/cowen_hybrid_regression_weights.csv`.
* `all`: Runs DSP, MERT, and Hybrid sequentially and displays a side-by-side $R^2$ comparative delta matrix.
