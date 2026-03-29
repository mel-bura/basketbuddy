import { useState, useEffect, useRef } from "react";
import { auth, googleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

// ─── STORAGE HELPER (local fallback) ───
const STORAGE_KEY = "basketbuddy_data";
const loadLocal = () => {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
  return null;
};
const saveLocal = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

// ─── CATEGORY DETECTION ───
const CATEGORIES = {
  "Fruits & Veg": ["apple","banana","orange","lemon","lime","avocado","tomato","potato","onion","garlic","ginger","carrot","broccoli","spinach","lettuce","cucumber","pepper","chilli","mushroom","celery","corn","peas","beans","zucchini","courgette","aubergine","eggplant","cabbage","kale","beetroot","sweet potato","mango","strawberry","blueberry","raspberry","grape","pineapple","watermelon","peach","pear","plum","cherry","coconut","papaya","fig","pomegranate","asparagus","leek","spring onion","radish","parsnip","turnip","squash","pumpkin","herbs","basil","cilantro","coriander","parsley","mint","rosemary","thyme","dill","chive","salad","rocket","watercress","bok choy","fennel","artichoke","okra"],
  "Meat & Fish": ["chicken","beef","pork","lamb","turkey","bacon","sausage","mince","steak","salmon","tuna","cod","prawn","shrimp","fish","ham","duck","veal","ribs","chorizo","pepperoni","salami","anchovy","sardine","mackerel","trout","crab","lobster","mussel","oyster","squid","brisket","fillet","vegan chicken","vegan"],
  "Dairy & Eggs": ["milk","cheese","butter","yogurt","yoghurt","cream","egg","eggs","cheddar","mozzarella","parmesan","feta","brie","camembert","ricotta","cottage cheese","sour cream","cream cheese","whipping cream","double cream","single cream","buttermilk","ghee","margarine","gouda","halloumi","plant milk","vegan butter"],
  "Bakery": ["bread","roll","baguette","croissant","muffin","bagel","tortilla","wrap","pita","pitta","naan","flatbread","sourdough","brioche","ciabatta","focaccia","crumpet","english muffin","pancake","waffle","scone","cake","pastry","doughnut","donut","puff pastry"],
  "Pantry": ["rice","pasta","noodle","flour","sugar","salt","oil","olive oil","vegetable oil","coconut oil","sesame oil","vinegar","soy sauce","ketchup","mustard","mayonnaise","hot sauce","sriracha","worcestershire","stock","broth","bouillon","tomato paste","tomato sauce","passata","coconut milk","peanut butter","jam","honey","maple syrup","nutella","cereal","oats","oatmeal","granola","baking powder","baking soda","yeast","cornstarch","cocoa","chocolate","vanilla","cinnamon","cumin","paprika","turmeric","oregano","chili flakes","curry","garam masala","bay leaf","quinoa","couscous","lentil","chickpea","black bean","kidney bean","canned","tinned","taco","seasoning","spice","breadcrumb","poultry seasoning","kosher salt","white wine"],
  "Frozen": ["frozen","ice cream","pizza","chips","fries","nuggets","popsicle","ice","sorbet","frozen veg","frozen fruit","frozen meal","fish fingers","frozen berries","gelato","frozen peas"],
  "Drinks": ["water","juice","soda","cola","beer","wine","coffee","tea","smoothie","lemonade","energy drink","sparkling","tonic","kombucha","oat milk","almond milk","soy milk","coconut water","squash","cordial","unsweetened plant milk"],
  "Snacks": ["crisps","crackers","popcorn","nuts","almonds","cashew","walnut","peanut","pistachio","trail mix","granola bar","protein bar","biscuit","cookie","candy","sweet","chocolate bar","gummy","pretzel","rice cake","dried fruit","raisins"],
  "Household": ["toilet paper","paper towel","trash bag","bin bag","detergent","dish soap","washing up liquid","sponge","bleach","cleaner","soap","shampoo","conditioner","toothpaste","toothbrush","deodorant","lotion","tissues","cling film","foil","aluminium foil","ziplock","plastic bag","candle","light bulb","battery","laundry","fabric softener","disinfectant","wipes"],
  "Other": []
};

const detectCategory = (itemName) => {
  const lower = itemName.toLowerCase().trim();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (cat === "Other") continue;
    for (const kw of keywords) {
      if (lower.includes(kw) || kw.includes(lower)) return cat;
    }
  }
  return "Other";
};

const CATEGORY_ICONS = {
  "Fruits & Veg": "\u{1F966}", "Meat & Fish": "\u{1F969}", "Dairy & Eggs": "\u{1F95A}",
  "Bakery": "\u{1F35E}", "Pantry": "\u{1FAD9}", "Frozen": "\u{1F9CA}",
  "Drinks": "\u{1F964}", "Snacks": "\u{1F36A}", "Household": "\u{1F9F9}", "Other": "\u{1F4E6}"
};

const CATEGORY_COLORS = {
  "Fruits & Veg": "#22c55e", "Meat & Fish": "#ef4444", "Dairy & Eggs": "#f59e0b",
  "Bakery": "#d97706", "Pantry": "#8b5cf6", "Frozen": "#06b6d4",
  "Drinks": "#3b82f6", "Snacks": "#f97316", "Household": "#6b7280", "Other": "#a855f7"
};

// ─── MEAL PLAN TAB ───
function MealPlanTab({ addItem, meals, setMeals }) {
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const [mealIngredients, setMealIngredients] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Weekly Meal Plan</h2>
        <p className="text-xs text-gray-500">Plan your meals, then add ingredients to your list</p>
      </div>
      <div className="space-y-2">
        {DAYS.map(day => (
          <div key={day} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">{day}</h3>
              <button onClick={() => setSelectedDay(selectedDay === day ? null : day)} className="text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-all">+ Add to list</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["breakfast","lunch","dinner"].map(type => (
                <div key={type}>
                  <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{type}</label>
                  <input value={meals[day]?.[type] || ""} onChange={(e) => setMeals(prev => ({ ...prev, [day]: { ...prev[day], [type]: e.target.value } }))} placeholder={`${type}...`} className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-gray-50" />
                </div>
              ))}
            </div>
            {selectedDay === day && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <textarea autoFocus value={mealIngredients} onChange={(e) => setMealIngredients(e.target.value)} placeholder="Type or paste ingredients for this day's meals..." className="w-full h-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <div className="flex justify-end mt-1">
                  <button onClick={() => { mealIngredients.split("\n").filter(l => l.trim()).forEach(l => addItem(l.trim())); setMealIngredients(""); setSelectedDay(null); }} className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all">Add to shopping list</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export default function BasketBuddy() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState(() => { const s = loadLocal(); return s?.items || []; });
  const [activeTab, setActiveTab] = useState("list");
  const [inputValue, setInputValue] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [sortBy, setSortBy] = useState("category");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [budget, setBudget] = useState(() => { const s = loadLocal(); return s?.budget || ""; });
  const [showBudget, setShowBudget] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [syncStatus, setSyncStatus] = useState("");
  const [meals, setMeals] = useState(() => {
    try { const s = localStorage.getItem("basketbuddy_meals"); if (s) return JSON.parse(s); } catch {}
    return ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].reduce((a, d) => { a[d] = { breakfast: "", lunch: "", dinner: "" }; return a; }, {});
  });
  const inputRef = useRef(null);
  const pasteRef = useRef(null);
  const skipNextSync = useRef(false);

  // ─── AUTH STATE ───
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ─── FIRESTORE REAL-TIME SYNC (listen) ───
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists() && !skipNextSync.current) {
        const data = snap.data();
        if (data.items) setItems(data.items);
        if (data.budget !== undefined) setBudget(data.budget);
        if (data.meals) setMeals(data.meals);
        setSyncStatus("synced");
      }
      skipNextSync.current = false;
    });
    return unsub;
  }, [user]);

  // ─── SAVE TO FIRESTORE + LOCAL ───
  useEffect(() => {
    saveLocal({ items, budget });
    if (user) {
      skipNextSync.current = true;
      setSyncStatus("saving...");
      const timeout = setTimeout(() => {
        setDoc(doc(db, "users", user.uid), { items, budget, meals, updatedAt: new Date().toISOString() }, { merge: true })
          .then(() => setSyncStatus("synced"))
          .catch(() => setSyncStatus("error"));
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [items, budget, user]);

  // ─── SAVE MEALS ───
  useEffect(() => {
    try { localStorage.setItem("basketbuddy_meals", JSON.stringify(meals)); } catch {}
    if (user) {
      skipNextSync.current = true;
      const timeout = setTimeout(() => {
        setDoc(doc(db, "users", user.uid), { meals, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [meals, user]);

  // ─── AUTH ACTIONS ───
  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // After sign-in, push local data to cloud if cloud is empty
      const localData = loadLocal();
      if (localData?.items?.length > 0) {
        await setDoc(doc(db, "users", result.user.uid), { items: localData.items, budget: localData.budget || "", meals, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (err) {
      console.error("Sign-in error:", err);
    }
  };

  const handleSignOut = async () => {
    try { await signOut(auth); setSyncStatus(""); } catch {}
  };

  const addItem = (name, qty = "") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = items.find(i => i.name.toLowerCase() === trimmed.toLowerCase() && !i.inBasket);
    if (existing) {
      setItems(prev => prev.map(i => i.id === existing.id ? { ...i, qty: String(Number(i.qty || 1) + 1) } : i));
      return;
    }
    setItems(prev => [{ id: Date.now() + Math.random(), name: trimmed, category: detectCategory(trimmed), inBasket: false, qty: qty || "1", price: "", note: "", addedAt: new Date().toISOString(), checkedAt: null }, ...prev]);
  };

  const toggleBasket = (id) => {
    setUndoStack(prev => [...prev.slice(-10), { items: JSON.parse(JSON.stringify(items)) }]);
    setItems(prev => prev.map(i => i.id === id ? { ...i, inBasket: !i.inBasket, checkedAt: !i.inBasket ? new Date().toISOString() : null } : i));
  };

  const deleteItem = (id) => {
    setUndoStack(prev => [...prev.slice(-10), { items: JSON.parse(JSON.stringify(items)) }]);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id, updates) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));

  const undo = () => {
    if (undoStack.length === 0) return;
    setItems(undoStack[undoStack.length - 1].items);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const clearBasket = () => {
    setUndoStack(prev => [...prev.slice(-10), { items: JSON.parse(JSON.stringify(items)) }]);
    setItems(prev => prev.filter(i => !i.inBasket));
    setShowClearConfirm(false);
  };

  const moveAllBack = () => setItems(prev => prev.map(i => ({ ...i, inBasket: false, checkedAt: null })));

  const parsePastedIngredients = (text) => {
    return text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0).map(line => {
      line = line.replace(/^[\s\-\*\u2022\u2023\u25E6\u2043\u2219]+/, "").trim().replace(/^\d+[\.\)]\s*/, "").trim();
      if (!line) return null;
      let qty = "", name = line;
      const qtyMatch = line.match(/^([\d\.\,\/\u00BD\u2153\u2154\u00BC\u00BE\u215B]+\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|litres?|l|pints?|bunch|bunches|cloves?|heads?|cans?|tins?|packets?|packs?|bags?|boxes?|bottles?|jars?|pieces?|slices?|fillets?|stalks?|sprigs?|handfuls?|pinch(?:es)?|large|medium|small|x|sheets?)?)\s+(.+)/i);
      if (qtyMatch) { qty = qtyMatch[1].trim(); name = qtyMatch[2].trim(); }
      else { const numMatch = line.match(/^(\d+)\s+(.+)/); if (numMatch) { qty = numMatch[1]; name = numMatch[2]; } }
      return name ? { name, qty } : null;
    }).filter(Boolean);
  };

  const handlePasteSubmit = () => {
    parsePastedIngredients(pasteValue).forEach(({ name, qty }) => addItem(name, qty));
    setPasteValue(""); setShowPaste(false);
  };

  const handleQuickAdd = (e) => {
    if (e.key === "Enter" && inputValue.trim()) {
      let name = inputValue.trim(), qty = "1";
      const t = name.match(/\s*x\s*(\d+)$/i);
      const l = name.match(/^(\d+)\s*x\s+/i);
      if (t) { qty = t[1]; name = name.replace(/\s*x\s*\d+$/i, "").trim(); }
      else if (l) { qty = l[1]; name = name.replace(/^\d+\s*x\s+/i, "").trim(); }
      addItem(name, qty); setInputValue("");
    }
  };

  const toBuyItems = items.filter(i => !i.inBasket);
  const inBasketItems = items.filter(i => i.inBasket);
  const filterItems = (list) => !searchQuery ? list : list.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.category.toLowerCase().includes(searchQuery.toLowerCase()));
  const sortItems = (list) => sortBy === "category" ? [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) : sortBy === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  const groupByCategory = (list) => { const g = {}; for (const i of list) { if (!g[i.category]) g[i.category] = []; g[i.category].push(i); } return g; };

  const totalSpent = items.filter(i => i.price).reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);
  const budgetNum = parseFloat(budget) || 0;
  const budgetRemaining = budgetNum > 0 ? budgetNum - totalSpent : null;

  const displayToBuy = sortItems(filterItems(toBuyItems));
  const displayBasket = filterItems(inBasketItems);
  const toBuyGroups = sortBy === "category" ? groupByCategory(displayToBuy) : null;

  const ItemCard = ({ item }) => {
    const isEditing = editingId === item.id;
    const catColor = CATEGORY_COLORS[item.category] || "#6b7280";
    return (
      <div className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${item.inBasket ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"}`}>
        <button onClick={() => toggleBasket(item.id)}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${item.inBasket ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 hover:border-emerald-400"}`}>
          {item.inBasket && <span className="text-sm">{"\u2713"}</span>}
        </button>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { updateItem(item.id, { name: editValue }); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }}
              onBlur={() => { updateItem(item.id, { name: editValue }); setEditingId(null); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium ${item.inBasket ? "line-through text-gray-400" : "text-gray-800"}`}>{item.name}</span>
              {item.qty && item.qty !== "1" && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md font-medium">x{item.qty}</span>}
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${catColor}15`, color: catColor }}>{CATEGORY_ICONS[item.category]} {item.category}</span>
            </div>
          )}
          {item.note && <p className="text-xs text-gray-400 mt-0.5">{item.note}</p>}
        </div>
        {item.price && <span className="text-xs font-medium text-gray-500">{"\u00A3"}{(parseFloat(item.price) * (parseInt(item.qty) || 1)).toFixed(2)}</span>}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!item.inBasket && (
            <>
              <button onClick={() => { setEditingId(item.id); setEditValue(item.name); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <input type="number" value={item.price} onChange={(e) => updateItem(item.id, { price: e.target.value })} placeholder={"\u00A3"} className="w-12 text-xs border border-gray-200 rounded-md px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500" onClick={(e) => e.stopPropagation()} />
            </>
          )}
          <button onClick={() => deleteItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    );
  };

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><span className="text-4xl block mb-3">{"\u{1F6D2}"}</span><p className="text-gray-400 text-sm">Loading...</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center"><span className="text-white text-lg">{"\u{1F6D2}"}</span></div>
              <div><h1 className="text-base font-bold text-gray-900 leading-tight">BasketBuddy</h1><p className="text-[10px] text-gray-400 leading-tight">Smart Shopping List</p></div>
            </div>
            <div className="flex items-center gap-2">
              {undoStack.length > 0 && <button onClick={undo} className="text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Undo</button>}
              <button onClick={() => setShowSearch(!showSearch)} className={`p-2 rounded-lg transition-all ${showSearch ? "bg-emerald-100 text-emerald-600" : "text-gray-400 hover:bg-gray-100"}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
              <button onClick={() => setShowBudget(!showBudget)} className={`p-2 rounded-lg transition-all ${showBudget ? "bg-emerald-100 text-emerald-600" : "text-gray-400 hover:bg-gray-100"}`}><span className="text-sm font-medium">{"\u00A3"}</span></button>
              {/* Auth button */}
              {user ? (
                <button onClick={handleSignOut} className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-all" title={`Signed in as ${user.email}\nClick to sign out`}>
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  {syncStatus === "synced" && <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>}
                  {syncStatus === "saving..." && <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>}
                  {syncStatus === "error" && <span className="w-2 h-2 bg-red-400 rounded-full"></span>}
                </button>
              ) : (
                <button onClick={handleSignIn} className="text-xs text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-all font-medium">Sign in</button>
              )}
            </div>
          </div>
          {!user && (
            <div className="pb-2">
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">Sign in with Google to sync your list across all devices</p>
            </div>
          )}
          {showSearch && <div className="pb-3"><input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search items..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" /></div>}
          {showBudget && <div className="pb-3 flex items-center gap-3"><div className="flex items-center gap-2 flex-1"><span className="text-xs text-gray-500">Budget:</span><input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>{budgetNum > 0 && <div className="flex items-center gap-3 text-xs"><span className="text-gray-500">Spent: <b className="text-gray-700">{"\u00A3"}{totalSpent.toFixed(2)}</b></span><span className={budgetRemaining < 0 ? "text-red-500 font-bold" : "text-emerald-600 font-bold"}>{budgetRemaining >= 0 ? `\u00A3${budgetRemaining.toFixed(2)} left` : `\u00A3${Math.abs(budgetRemaining).toFixed(2)} over!`}</span></div>}</div>}
          <div className="flex gap-1 -mb-px">
            {[{id:"list",label:"To Buy",icon:"\u{1F4DD}",count:toBuyItems.length},{id:"basket",label:"In Basket",icon:"\u{1F6D2}",count:inBasketItems.length},{id:"meals",label:"Meal Plan",icon:"\u{1F37D}\uFE0F",count:0}].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.icon} {tab.label} {tab.count > 0 && <span className={`w-5 h-5 ${tab.id === "basket" ? "bg-gray-400" : "bg-emerald-500"} text-white text-[10px] rounded-full flex items-center justify-center font-bold`}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 pb-32">
        {activeTab === "list" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleQuickAdd} placeholder="Add item... (e.g. 'milk' or 'eggs x6')" className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white shadow-sm" />
              <button onClick={() => { if (inputValue.trim()) { addItem(inputValue.trim()); setInputValue(""); } }} className="px-4 py-3 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-all shadow-sm">Add</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowPaste(!showPaste); setTimeout(() => pasteRef.current?.focus(), 100); }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                Paste Ingredients
              </button>
              <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <span>Sort:</span>
                {["category","name","recent"].map(s => <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-1 rounded-md capitalize transition-all ${sortBy === s ? "bg-gray-200 text-gray-700 font-medium" : "hover:bg-gray-100 text-gray-400"}`}>{s}</button>)}
              </div>
            </div>
            {showPaste && (
              <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-gray-800">Paste Ingredients List</h3><button onClick={() => setShowPaste(false)} className="text-gray-400 hover:text-gray-600"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
                <p className="text-xs text-gray-500 mb-2">Paste a recipe's ingredient list and we'll parse it into your shopping list.</p>
                <textarea ref={pasteRef} value={pasteValue} onChange={(e) => setPasteValue(e.target.value)} placeholder={"e.g.\n2 cups flour\n200g chicken breast\n1 can coconut milk\n3 cloves garlic\nSalt and pepper"} className="w-full h-32 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-400">{pasteValue.split("\n").filter(l => l.trim()).length} items detected</span>
                  <button onClick={handlePasteSubmit} disabled={!pasteValue.trim()} className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Add All to List</button>
                </div>
              </div>
            )}
            {displayToBuy.length === 0 ? (
              <div className="text-center py-16"><span className="text-5xl mb-4 block">{"\u{1F6D2}"}</span><p className="text-gray-500 font-medium">Your list is empty</p><p className="text-gray-400 text-sm mt-1">Add items above or paste an ingredient list</p></div>
            ) : sortBy === "category" && toBuyGroups ? (
              Object.entries(toBuyGroups).sort(([a],[b]) => a.localeCompare(b)).map(([cat, catItems]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2 mt-1"><span className="text-sm">{CATEGORY_ICONS[cat]}</span><h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat}</h3><span className="text-xs text-gray-400">({catItems.length})</span><div className="flex-1 h-px bg-gray-100 ml-2"></div></div>
                  <div className="space-y-1.5">{catItems.map(item => <ItemCard key={item.id} item={item} />)}</div>
                </div>
              ))
            ) : <div className="space-y-1.5">{displayToBuy.map(item => <ItemCard key={item.id} item={item} />)}</div>}
            {toBuyItems.length > 0 && <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between text-xs text-gray-500"><span>{toBuyItems.length} items to buy</span><span>{Object.keys(groupByCategory(toBuyItems)).length} categories</span></div>}
          </div>
        )}

        {activeTab === "basket" && (
          <div className="space-y-4">
            {inBasketItems.length === 0 ? (
              <div className="text-center py-16"><span className="text-5xl mb-4 block">{"\u2705"}</span><p className="text-gray-500 font-medium">Basket is empty</p><p className="text-gray-400 text-sm mt-1">Tick items from your list to move them here</p></div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600 font-medium">{inBasketItems.length} items in basket</p>
                  <div className="flex gap-2">
                    <button onClick={moveAllBack} className="text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-all">Move all back</button>
                    <button onClick={() => setShowClearConfirm(true)} className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all">Clear basket</button>
                  </div>
                </div>
                {showClearConfirm && <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between"><p className="text-sm text-red-700">Remove all items from basket?</p><div className="flex gap-2"><button onClick={() => setShowClearConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600">Cancel</button><button onClick={clearBasket} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white">Yes, clear</button></div></div>}
                <div className="space-y-1.5">{displayBasket.map(item => <ItemCard key={item.id} item={item} />)}</div>
                {totalSpent > 0 && <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 flex items-center justify-between"><span className="text-sm font-medium text-emerald-800">Estimated Total</span><span className="text-lg font-bold text-emerald-600">{"\u00A3"}{totalSpent.toFixed(2)}</span></div>}
              </>
            )}
          </div>
        )}

        {activeTab === "meals" && <MealPlanTab addItem={addItem} meals={meals} setMeals={setMeals} />}
      </div>

      {activeTab === "list" && <div className="fixed bottom-6 right-6 z-50"><button onClick={() => { inputRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="w-14 h-14 bg-emerald-500 text-white rounded-2xl shadow-lg hover:bg-emerald-600 transition-all flex items-center justify-center text-2xl hover:scale-105">+</button></div>}
    </div>
  );
}
