# app.py
"""
Wordle 后端示例（开发版）
"""
from flask_cors import CORS
from flask import Flask, jsonify, request, abort
from flask_sqlalchemy import SQLAlchemy
import datetime
import os
import json

# -------------------------
# 基本配置
# -------------------------
app = Flask(__name__)

CORS(app)  # 允许跨域

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# -------------------------
# 数据模型
# -------------------------
class DailyAnswer(db.Model):
    __tablename__ = 'daily_answers'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), unique=True, nullable=False)
    answer = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {"date": self.date, "answer": self.answer}

# -------------------------
# 备用单词列表
# -------------------------
FALLBACK_WORDS = ["apple","trace","sugar","candy","story","light","crazy","bring","flame","pride"]

# -------------------------
# 初始化：建表并种子数据
# -------------------------
def seed_if_empty():
    # ### [修改] 必须在应用上下文中执行数据库操作
    db.create_all()
    if DailyAnswer.query.count() == 0:
        print("正在初始化数据库数据...")
        words = FALLBACK_WORDS
        if os.path.exists("words.json"):
            try:
                with open("words.json", "r") as f:
                    data = json.load(f)
                    if isinstance(data, list) and data:
                        words = data
            except Exception as e:
                print("读取 words.json 失败，使用默认单词列表：", e)
        
        start = datetime.date.today() - datetime.timedelta(days=30)
        for i in range(60):
            d = (start + datetime.timedelta(days=i)).isoformat()
            w = words[i % len(words)]
            db.session.add(DailyAnswer(date=d, answer=w))
        db.session.commit()
        print("数据库初始化完成！")

@app.route("/")
def index():
    return "Wordle backend is running."

# -------------------------
# 路由（API）
# -------------------------
@app.route("/api/today-answer", methods=["GET"])
def get_today_answer():
    today = datetime.date.today().isoformat()
    rec = DailyAnswer.query.filter_by(date=today).first()
    if rec:
        return jsonify(rec.to_dict()), 200
    
    # 兜底逻辑
    words = FALLBACK_WORDS
    idx = datetime.date.today().toordinal() % len(words)
    return jsonify({"date": today, "answer": words[idx]}), 200

@app.route("/api/answers", methods=["GET"])
def list_answers():
    rows = DailyAnswer.query.order_by(DailyAnswer.date).all()
    return jsonify([r.to_dict() for r in rows]), 200

@app.route("/api/answer", methods=["POST"])
def set_answer():
    if not request.is_json:
        abort(400, "Expected JSON body")
    body = request.get_json()
    date = body.get("date")
    answer = body.get("answer")
    if not date or not answer:
        abort(400, "Missing date or answer")
    rec = DailyAnswer.query.filter_by(date=date).first()
    if rec:
        rec.answer = answer
    else:
        rec = DailyAnswer(date=date, answer=answer)
        db.session.add(rec)
    db.session.commit()
    return jsonify(rec.to_dict()), 201

# -------------------------
# 核心逻辑
# -------------------------
def evaluate_guess(answer, guess):
    n = len(answer)
    res = ['gray'] * n
    ans_chars = list(answer)
    guess_chars = list(guess)

    # 1. 绿
    for i in range(n):
        if guess_chars[i] == ans_chars[i]:
            res[i] = 'green'
            ans_chars[i] = None
            guess_chars[i] = None

    # 2. 黄
    for i in range(n):
        if guess_chars[i] is not None:
            try:
                j = ans_chars.index(guess_chars[i])
                res[i] = 'yellow'
                ans_chars[j] = None
            except ValueError:
                res[i] = 'gray'
    return res

@app.route("/api/guess", methods=["POST"])
def post_guess():
    if not request.is_json:
        abort(400, "Expected JSON")
    body = request.get_json()
    guess = body.get("guess")
    if not guess:
        abort(400, "Missing guess")
    guess = guess.strip().lower()
    
    if len(guess) != 5:
        abort(400, "Guess must be 5 letters")

    today = datetime.date.today().isoformat()
    rec = DailyAnswer.query.filter_by(date=today).first()
    
    # 获取正确答案（如果没有记录，使用算法兜底）
    actual_answer = rec.answer if rec else (FALLBACK_WORDS[datetime.date.today().toordinal() % len(FALLBACK_WORDS)])
    
    # 计算颜色
    result = evaluate_guess(actual_answer, guess)
    
    # ### [修改] 计算胜负
    is_win = (guess == actual_answer)

    # ### [修改] 返回数据中增加 win 字段，方便前端判断
    # 也可以选择在这里把 actual_answer 返回给前端（方便调试），但在生产环境不建议
    return jsonify({
        "date": today,
        "guess": guess,
        "result": result, # ['green', 'gray', ...]
        "win": is_win,
        "answer": actual_answer if is_win else None # 只有赢了才告诉他答案，或者你可以选择 always return actual_answer 方便调试
    }), 200

# -------------------------
# 运行应用
# -------------------------
if __name__ == "__main__":
    # ### [修改] 在启动前初始化数据库！这是最关键的一步
    with app.app_context():
        seed_if_empty()
        
    print("Backend running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)

