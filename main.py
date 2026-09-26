from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import joblib
import pandas as pd
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

ml_model = {}

ORIGINAL_FIELDS = [
    "person_age", "person_income", "person_home_ownership",
    "person_emp_length", "loan_intent", "loan_grade", "loan_amnt",
    "loan_int_rate", "loan_percent_income",
    "cb_person_default_on_file", "cb_person_cred_hist_length",
]


def compute_feature_importance(model):
    try:
        base_est = model.calibrated_classifiers_[0].estimator
        preprocessor = base_est.named_steps["preprocessor"]
        classifier = base_est.named_steps["classifier"]

        encoded_names = preprocessor.get_feature_names_out()
        importances = classifier.feature_importances_

        agg = {f: 0.0 for f in ORIGINAL_FIELDS}
        for name, imp in zip(encoded_names, importances):
            stripped = name.split("__", 1)[-1]
            match = max(
                (f for f in ORIGINAL_FIELDS if stripped.startswith(f)),
                key=len,
                default=None,
            )
            if match:
                agg[match] += float(imp)

        total = sum(agg.values()) or 1.0
        ranked = sorted(
            ({"field": f, "importance": v / total} for f, v in agg.items()),
            key=lambda x: x["importance"],
            reverse=True,
        )
        return ranked
    except Exception:
        return []


@asynccontextmanager
async def lifespan(app: FastAPI):
    ml_model["model"] = joblib.load("credit_risk_model.pkl")
    ml_model["threshold"] = joblib.load("best_threshold.pkl")
    ml_model["feature_importance"] = compute_feature_importance(ml_model["model"])
    yield
    ml_model.clear()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoanApplication(BaseModel):
    person_age: int
    person_income: float
    person_home_ownership: str
    person_emp_length: float
    loan_intent: str
    loan_grade: str
    loan_amnt: float
    loan_int_rate: float
    loan_percent_income: float
    cb_person_default_on_file: str
    cb_person_cred_hist_length: int


@app.get("/api")
def greet():
    return {"message": "hello, world"}


@app.get("/feature-importance")
def feature_importance():
    return {"features": ml_model.get("feature_importance", [])}


@app.post("/predict")
def predict(data: LoanApplication):
    input_df = pd.DataFrame([data.model_dump()])
    probability = ml_model["model"].predict_proba(input_df)[:, 1][0]
    prediction = int(probability >= ml_model["threshold"])

    return {
        "default_probability": float(probability),
        "default_prediction": prediction,
        "threshold": float(ml_model["threshold"]),
        "result": "high risk" if prediction == 1 else "low risk"
    }


# Yeh sabse aakhir mein hona chahiye — baaki saari routes ke baad
app.mount("/", StaticFiles(directory="static", html=True), name="frontend")