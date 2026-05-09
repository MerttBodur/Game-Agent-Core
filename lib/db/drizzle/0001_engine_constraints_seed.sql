INSERT INTO engine_constraints (id, engine, category, constraint_type, condition_json, result_json, priority) VALUES
  (1, 'Unity', 'programming_language', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('C#'), 'note', 'Unity icin birincil dil C# olarak sabitlenir.'), 100),
  (2, 'Unreal', 'programming_language', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('C++', 'Blueprints'), 'note', 'Unreal projelerinde C++ ve Blueprints kullanimi sabitlenir.'), 100),
  (3, 'Godot', 'programming_language', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('GDScript', 'C#'), 'note', 'Godot icin GDScript veya C# onerilir.'), 100),
  (4, 'Custom', 'programming_language', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('C++', 'Rust', 'TypeScript'), 'note', 'Custom stackte dil secimi altyapiya gore kilitlenir.'), 100),
  (5, 'Unity', 'ui_framework', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('UGUI', 'UI Toolkit'), 'note', 'Unity icin UGUI/UI Toolkit tercih edilir.'), 100),
  (6, 'Unreal', 'ui_framework', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('UMG'), 'note', 'Unreal UI katmaninda UMG kullanimi sabitlenir.'), 100),
  (7, 'Godot', 'ui_framework', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('Control Nodes'), 'note', 'Godot UI icin Control Node tabanli yapi onerilir.'), 100),
  (8, 'Custom', 'ui_framework', 'engine_locked', NULL, JSON_OBJECT('lockedTo', JSON_ARRAY('Dear ImGui', 'HTML/CSS UI'), 'note', 'Custom stackte UI framework secimi platforma gore belirlenir.'), 100),
  (9, '*', 'networking', 'feature_required', JSON_OBJECT('multiplayer', true), JSON_OBJECT('reason', 'Multiplayer kapaliyken networking kategorisi atlanir.'), 50),
  (10, '*', 'version_control', 'context_dependent', JSON_OBJECT('teamSize', 'team'), JSON_OBJECT('recommend_ids', JSON_ARRAY('git_github', 'plastic_scm'), 'note', 'Takim calismasinda surum kontrol adaylari is birligi odakli daraltilir.'), 40)
ON DUPLICATE KEY UPDATE
  engine = VALUES(engine),
  category = VALUES(category),
  constraint_type = VALUES(constraint_type),
  condition_json = VALUES(condition_json),
  result_json = VALUES(result_json),
  priority = VALUES(priority);
