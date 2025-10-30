-- Function: calculate_total_spending(user_id, month, year)
CREATE OR REPLACE FUNCTION calculate_total_spending(u_id INT, m INT, y INT)
RETURNS DECIMAL AS $$
DECLARE
  total DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(amount),0)
  INTO total
  FROM transactions
  WHERE user_id = u_id AND EXTRACT(MONTH FROM txn_date) = m AND EXTRACT(YEAR FROM txn_date) = y;
  
  RETURN total;
END;
$$ LANGUAGE plpgsql;


-- Trigger function: check_budget_limit
CREATE OR REPLACE FUNCTION check_budget_limit()
RETURNS TRIGGER AS $$
DECLARE
  spent DECIMAL(10,2);
  limit_amt DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(amount),0)
  INTO spent
  FROM transactions
  WHERE user_id = NEW.user_id AND category_id = NEW.category_id 
    AND EXTRACT(MONTH FROM txn_date) = EXTRACT(MONTH FROM NEW.txn_date)
    AND EXTRACT(YEAR FROM txn_date) = EXTRACT(YEAR FROM NEW.txn_date);

  SELECT limit_amount INTO limit_amt
  FROM budgets
  WHERE user_id = NEW.user_id AND category_id = NEW.category_id
    AND month = EXTRACT(MONTH FROM NEW.txn_date)
    AND year = EXTRACT(YEAR FROM NEW.txn_date);

  IF spent > limit_amt THEN
    INSERT INTO alerts(user_id, category_id, message)
    VALUES (NEW.user_id, NEW.category_id, 'Budget exceeded for this category!');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_check
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION check_budget_limit();


-- View: Monthly Summary
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
  u.user_id,
  u.name AS user_name,
  EXTRACT(MONTH FROM t.txn_date) AS month,
  EXTRACT(YEAR FROM t.txn_date) AS year,
  SUM(CASE WHEN c.type='expense' THEN t.amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN c.type='income' THEN t.amount ELSE 0 END) AS total_income
FROM users u
JOIN transactions t ON u.user_id = t.user_id
JOIN categories c ON c.category_id = t.category_id
GROUP BY u.user_id, u.name, month, year;
