import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PlusCircle, Archive, Truck, CheckCircle, DollarSign, Package, Users, ShoppingCart, TrendingUp, AlertCircle, Edit2, Trash2, X, Lock, Tag, Loader2, WifiOff } from 'lucide-react';

// -- FIREBASE SDK IMPORTS -- //
// These are now included to connect to the Firebase backend.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";


// -- FIREBASE CONFIGURATION -- //
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD65flx2WhmIeS63QpH72pYLW4htvB3vxs",
  authDomain: "altaj-7a374.firebaseapp.com",
  projectId: "altaj-7a374",
  storageBucket: "altaj-7a374.appspot.com",
  messagingSenderId: "307076659402",
  appId: "1:307076659402:web:acfc134553f971e3cc5c33",
  measurementId: "G-E7DXWVFZ85"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// -- MAIN APP COMPONENT -- //
export default function App() {
    // -- STATE MANAGEMENT -- //
    const [activeView, setActiveView] = useState('dashboard');
    const [orders, setOrders] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [products, setProducts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState(null);

    // -- AUTHENTICATION & DATA FETCHING -- //
    useEffect(() => {
        // Listen for authentication state changes
        const unsubscribeAuth = onAuthStateChanged(auth, user => {
            if (user) {
                // User is signed in.
                setUserId(user.uid);
                setIsLoading(false);
                setError(null);
            } else {
                // User is signed out. Sign in anonymously.
                signInAnonymously(auth).catch(err => {
                    console.error("Anonymous sign-in failed:", err);
                    setError(err);
                    setIsLoading(false);
                });
            }
        });

        return () => unsubscribeAuth(); // Cleanup subscription
    }, []);
    
    // Effect to fetch data once user is authenticated
    useEffect(() => {
        if (!userId) return;

        const collections = {
            orders: setOrders,
            products: setProducts,
            inventory: setInventory,
            expenses: setExpenses,
        };

        const unsubscribers = Object.entries(collections).map(([name, setter]) => {
            const collRef = collection(db, `users/${userId}/${name}`);
            return onSnapshot(collRef, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setter(data);
            }, (err) => {
                console.error(`Error fetching ${name}: `, err);
                setError(err);
            });
        });
        
        return () => unsubscribers.forEach(unsub => unsub()); // Cleanup all listeners
    }, [userId]);


    // -- AUTOMATIC SHIPPING CALCULATION -- //
    const calculateAndSetShipping = useCallback(async () => {
        if (!userId || orders.length === 0) return;

        const totalShippingCost = orders.reduce((total, order) => {
            const city = order.city || '';
            const shippingCost = city.trim().toLowerCase() === 'casablanca' ? 20 : 30;
            return total + shippingCost;
        }, 0);

        const shippingDocRef = doc(db, `users/${userId}/expenses`, 'autoShipping');
        try {
            await setDoc(shippingDocRef, {
                category: 'Shipping',
                description: 'Automated shipping costs from orders',
                amount: totalShippingCost,
                date: new Date().toISOString().split('T')[0],
                isAuto: true
            }, { merge: true });
        } catch (error) {
            console.error("Error updating auto shipping cost:", error);
        }
    }, [orders, userId]);

    useEffect(() => {
        calculateAndSetShipping();
    }, [calculateAndSetShipping]);


    // -- DATA CALCULATIONS (MEMOIZED FOR PERFORMANCE) -- //
    const calculations = useMemo(() => {
        const totalRevenue = orders
            .filter(order => order.status === 'Delivered')
            .reduce((sum, order) => sum + order.total, 0);
            
        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const netProfit = totalRevenue - totalExpenses;
        const pendingOrders = orders.filter(o => o.status === 'Pending').length;
        const lowStockItems = inventory.filter(item => item.stock <= item.lowStockThreshold).length;

        const expenseByCategory = expenses.reduce((acc, expense) => {
            acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
            return acc;
        }, {});

        const expenseChartData = Object.keys(expenseByCategory).map(key => ({ name: key, value: expenseByCategory[key] }));

        const salesByMonth = orders.reduce((acc, order) => {
            const month = new Date(order.date).toLocaleString('default', { month: 'short', year: 'numeric' });
            if (!acc[month]) {
                acc[month] = { revenue: 0, expenses: 0 };
            }
            if (order.status === 'Delivered') {
                 acc[month].revenue += order.total;
            }
            return acc;
        }, {});

        expenses.forEach(expense => {
            const month = new Date(expense.date).toLocaleString('default', { month: 'short', year: 'numeric' });
             if (!salesByMonth[month]) {
                salesByMonth[month] = { revenue: 0, expenses: 0 };
            }
            salesByMonth[month].expenses += expense.amount;
        });

        const profitChartData = Object.keys(salesByMonth).map(month => ({
            name: month,
            Revenue: salesByMonth[month].revenue,
            Expenses: salesByMonth[month].expenses,
            Profit: salesByMonth[month].revenue - salesByMonth[month].expenses,
        })).sort((a, b) => new Date(a.name) - new Date(b.name));

        return { totalRevenue, totalExpenses, netProfit, pendingOrders, lowStockItems, expenseChartData, profitChartData };
    }, [orders, expenses, inventory]);

    // -- CRUD FUNCTIONS (Now async and using Firebase) -- //
    const createCrudFunctions = (collectionName) => ({
        add: async (data) => addDoc(collection(db, `users/${userId}/${collectionName}`), data),
        update: async (id, data) => updateDoc(doc(db, `users/${userId}/${collectionName}`, id), data),
        delete: async (id) => deleteDoc(doc(db, `users/${userId}/${collectionName}`, id)),
    });

    const orderActions = createCrudFunctions('orders');
    const productActions = createCrudFunctions('products');
    const inventoryActions = createCrudFunctions('inventory');
    const expenseActions = createCrudFunctions('expenses');

    // -- MODAL HANDLING -- //
    const openModal = (type, data = null) => {
        setModalContent({ type, data });
        setIsModalOpen(true);
    };
    
    const handleModalSubmit = (action) => async (data) => {
        try {
            await action(data);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to submit data:", error);
            setError(error);
        }
    };

    const handleModalUpdate = (action) => async (data) => {
        try {
            await action(modalContent.data.id, data);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to update data:", error);
            setError(error);
        }
    };

    if (isLoading) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-amber-400 mb-4" />
                <p className="text-lg">Connecting to your database...</p>
            </div>
        );
    }

    if (error) {
        return <FirebaseErrorDisplay error={error} />;
    }

    // -- RENDER LOGIC -- //
    const renderView = () => {
        switch (activeView) {
            case 'dashboard': return <DashboardView stats={calculations} />;
            case 'orders': return <OrdersView orders={orders} onStatusChange={orderActions.update} onDelete={orderActions.delete} onAdd={() => openModal('addOrder')} onEdit={(order) => openModal('editOrder', order)} />;
            case 'products': return <ProductsView products={products} onDelete={productActions.delete} onAdd={() => openModal('addProduct')} onEdit={(product) => openModal('editProduct', product)} />;
            case 'inventory': return <InventoryView inventory={inventory} onDelete={inventoryActions.delete} onAdd={() => openModal('addInventory')} onEdit={(item) => openModal('editInventory', item)} />;
            case 'expenses': return <ExpensesView expenses={expenses} onDelete={expenseActions.delete} onAdd={() => openModal('addExpense')} onEdit={(expense) => openModal('editExpense', expense)} />;
            default: return <DashboardView stats={calculations} />;
        }
    };

    const renderModal = () => {
        if (!isModalOpen || !modalContent) return null;
        switch (modalContent.type) {
            case 'addOrder': return <OrderForm products={products} onSubmit={handleModalSubmit(orderActions.add)} onCancel={() => setIsModalOpen(false)} />;
            case 'editOrder': return <OrderForm products={products} order={modalContent.data} onSubmit={handleModalUpdate(orderActions.update)} onCancel={() => setIsModalOpen(false)} />;
            case 'addProduct': return <ProductForm onSubmit={handleModalSubmit(productActions.add)} onCancel={() => setIsModalOpen(false)} />;
            case 'editProduct': return <ProductForm product={modalContent.data} onSubmit={handleModalUpdate(productActions.update)} onCancel={() => setIsModalOpen(false)} />;
            case 'addInventory': return <InventoryForm onSubmit={handleModalSubmit(inventoryActions.add)} onCancel={() => setIsModalOpen(false)} />;
            case 'editInventory': return <InventoryForm item={modalContent.data} onSubmit={handleModalUpdate(inventoryActions.update)} onCancel={() => setIsModalOpen(false)} />;
            case 'addExpense': return <ExpenseForm onSubmit={handleModalSubmit(expenseActions.add)} onCancel={() => setIsModalOpen(false)} />;
            case 'editExpense': return <ExpenseForm expense={modalContent.data} onSubmit={handleModalUpdate(expenseActions.update)} onCancel={() => setIsModalOpen(false)} />;
            default: return null;
        }
    };

    return (
        <div className="bg-gray-900 text-white font-sans flex min-h-screen">
            <Sidebar activeView={activeView} setActiveView={setActiveView} />
            <main className="flex-1 p-4 sm:p-6 md:p-8">
                {renderView()}
            </main>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md relative animate-fade-in-up">
                        {renderModal()}
                    </div>
                </div>
            )}
        </div>
    );
}

// -- ERROR DISPLAY COMPONENT -- //
const FirebaseErrorDisplay = ({ error }) => {
    let title = "Connection Error";
    let message = "Could not connect to the database. Please check your internet connection.";
    let steps = [];

    if (error.code) {
        switch (error.code) {
            case 'auth/api-key-not-valid':
                title = "Invalid Firebase API Key";
                message = "The API key in your `firebaseConfig` is not valid. Please make sure you have copied it correctly from your Firebase project.";
                steps = [
                    "Go to your Firebase project settings.",
                    "Under 'Your apps', find your web app.",
                    "Copy the `firebaseConfig` object and paste it into the code."
                ];
                break;
            case 'auth/configuration-not-found':
                 title = "Firebase Authentication Not Enabled";
                 message = "This usually means you haven't enabled the necessary services in your Firebase project. For this app, you need to enable Anonymous Authentication.";
                 steps = [
                     "Go to the Firebase Console and select your project.",
                     "Navigate to the 'Authentication' section.",
                     "Click on the 'Sign-in method' tab.",
                     "Find 'Anonymous' in the list and enable it."
                 ];
                break;
            case 'permission-denied':
                title = "Database Permission Denied";
                message = "Your app is connected, but the database security rules are blocking it. You need to update your Firestore rules to allow signed-in users to access their own data.";
                steps = [
                    "In the Firebase Console, go to 'Firestore Database'.",
                    "Click the 'Rules' tab.",
                    "Replace the entire rules text with the correct rules for this app (see previous instructions).",
                    "Click 'Publish'."
                ];
                break;
            default:
                title = "An Unknown Error Occurred";
                message = `An unexpected error occurred: ${error.message}`;
                break;
        }
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
            <WifiOff className="h-16 w-16 text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-red-400 mb-2">{title}</h1>
            <p className="text-gray-300 max-w-lg">{message}</p>
            {steps.length > 0 && (
                <div className="text-left bg-gray-800 p-4 rounded-lg mt-6 max-w-lg w-full">
                    <h2 className="font-bold mb-2 text-amber-400">How to Fix:</h2>
                    <ol className="list-decimal list-inside space-y-2 text-gray-400">
                        {steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                </div>
            )}
        </div>
    );
};


// -- SIDEBAR COMPONENT -- //
const Sidebar = ({ activeView, setActiveView }) => {
    const navItems = [
        { id: 'dashboard', icon: TrendingUp, label: 'Dashboard' },
        { id: 'orders', icon: ShoppingCart, label: 'Orders' },
        { id: 'products', icon: Tag, label: 'Products' },
        { id: 'inventory', icon: Package, label: 'Inventory' },
        { id: 'expenses', icon: DollarSign, label: 'Expenses' },
    ];
    return (
        <nav className="bg-gray-800 w-16 md:w-64 p-2 md:p-4 flex flex-col space-y-2 transition-all duration-300">
            <div className="flex items-center justify-center md:justify-start space-x-3 mb-8 p-2">
                <Archive className="h-8 w-8 text-amber-400" />
                <h1 className="text-xl font-bold hidden md:block">LeatherCraft HQ</h1>
            </div>
            {navItems.map(item => (
                <button key={item.id} onClick={() => setActiveView(item.id)} className={`flex items-center space-x-4 p-3 rounded-lg transition-colors duration-200 w-full text-left ${activeView === item.id ? 'bg-amber-500 text-gray-900 shadow-lg' : 'hover:bg-gray-700'}`}>
                    <item.icon className="h-6 w-6 flex-shrink-0" />
                    <span className="font-semibold hidden md:block">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

// -- DASHBOARD VIEW COMPONENT -- //
const DashboardView = ({ stats }) => {
    const { totalRevenue, totalExpenses, netProfit, pendingOrders, lowStockItems, expenseChartData, profitChartData } = stats;
    const PIE_COLORS = ['#FFBB28', '#FF8042', '#0088FE', '#00C49F', '#FF0000'];
    return (
        <div className="space-y-8 animate-fade-in">
            <h2 className="text-3xl font-bold text-amber-400">Dashboard</h2>
            <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-300 px-4 py-3 rounded-lg" role="alert">
                <p className="font-bold">Note:</p>
                <p className="text-sm">Net Profit is calculated using revenue from 'Delivered' orders only.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={DollarSign} title="Realized Revenue" value={`${totalRevenue.toFixed(2)} MAD`} color="text-green-400" />
                <StatCard icon={DollarSign} title="Net Profit" value={`${netProfit.toFixed(2)} MAD`} color={netProfit >= 0 ? "text-green-400" : "text-red-400"} />
                <StatCard icon={ShoppingCart} title="Pending Orders" value={pendingOrders} color="text-yellow-400" />
                <StatCard icon={AlertCircle} title="Low Stock Items" value={lowStockItems} color="text-red-400" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-gray-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4">Profit Overview (Revenue vs Expenses)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={profitChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                            <XAxis dataKey="name" stroke="#A0AEC0" />
                            <YAxis stroke="#A0AEC0" />
                            <Tooltip contentStyle={{ backgroundColor: '#1A202C', border: '1px solid #4A5568' }} formatter={(value) => `${value} MAD`} />
                            <Legend />
                            <Bar dataKey="Revenue" fill="#48BB78" />
                            <Bar dataKey="Expenses" fill="#F56565" />
                            <Bar dataKey="Profit" fill="#FFBB28" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4">Expenses by Category</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={expenseChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label={(entry) => `${entry.value.toFixed(0)} MAD`}>
                                {expenseChartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} /> ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1A202C' }} formatter={(value) => `${value.toFixed(2)} MAD`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon: Icon, title, value, color }) => (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg flex items-center space-x-4">
        <div className="bg-gray-700 p-3 rounded-full">
            <Icon className={`h-8 w-8 ${color}`} />
        </div>
        <div>
            <p className="text-gray-400 text-sm">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
    </div>
);

// -- ORDERS VIEW COMPONENT -- //
const OrdersView = ({ orders, onStatusChange, onDelete, onAdd, onEdit }) => {
    const getStatusChip = (status) => {
        switch (status) {
            case 'Pending': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500';
            case 'Shipped': return 'bg-blue-500/20 text-blue-400 border border-blue-500';
            case 'Delivered': return 'bg-green-500/20 text-green-400 border border-green-500';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };
    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-amber-400">Orders</h2>
                <button onClick={onAdd} className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg flex items-center space-x-2 hover:bg-amber-400 transition-colors shadow-md">
                    <PlusCircle size={20} />
                    <span>New Order</span>
                </button>
            </div>
            <div className="bg-gray-800 rounded-2xl shadow-lg overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-gray-700">
                        <tr>
                            <th className="p-4">Customer</th>
                            <th className="p-4">City</th>
                            <th className="p-4">Date</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                <td className="p-4">{order.customerName}</td>
                                <td className="p-4 text-gray-400">{order.city}</td>
                                <td className="p-4">{order.date}</td>
                                <td className="p-4 font-semibold">{order.total.toFixed(2)} MAD</td>
                                <td className="p-4">
                                    <select value={order.status} onChange={(e) => onStatusChange(order.id, { status: e.target.value })} className={`bg-transparent p-2 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 ${getStatusChip(order.status)}`}>
                                        <option value="Pending" className="bg-gray-800">Pending</option>
                                        <option value="Shipped" className="bg-gray-800">Shipped</option>
                                        <option value="Delivered" className="bg-gray-800">Delivered</option>
                                    </select>
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    <button onClick={() => onEdit(order)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full hover:bg-blue-500/10"><Edit2 size={18} /></button>
                                    <button onClick={() => onDelete(order.id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-500/10"><Trash2 size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// -- PRODUCTS VIEW COMPONENT -- //
const ProductsView = ({ products, onDelete, onAdd, onEdit }) => (
    <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold text-amber-400">Products</h2>
            <button onClick={onAdd} className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg flex items-center space-x-2 hover:bg-amber-400 transition-colors shadow-md">
                <PlusCircle size={20} />
                <span>New Product</span>
            </button>
        </div>
        <div className="bg-gray-800 rounded-2xl shadow-lg overflow-x-auto">
            <table className="w-full text-left">
                <thead className="border-b border-gray-700">
                    <tr>
                        <th className="p-4">Product Name</th>
                        <th className="p-4">Color</th>
                        <th className="p-4">Price</th>
                        <th className="p-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map(product => (
                        <tr key={product.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="p-4">{product.name}</td>
                            <td className="p-4 text-gray-400">{product.color}</td>
                            <td className="p-4 font-semibold">{product.price.toFixed(2)} MAD</td>
                            <td className="p-4 text-right space-x-2">
                                <button onClick={() => onEdit(product)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full hover:bg-blue-500/10"><Edit2 size={18} /></button>
                                <button onClick={() => onDelete(product.id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-500/10"><Trash2 size={18} /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);


// -- INVENTORY VIEW COMPONENT -- //
const InventoryView = ({ inventory, onDelete, onAdd, onEdit }) => (
    <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold text-amber-400">Inventory</h2>
            <button onClick={onAdd} className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg flex items-center space-x-2 hover:bg-amber-400 transition-colors shadow-md">
                <PlusCircle size={20} />
                <span>Add Item</span>
            </button>
        </div>
        <div className="bg-gray-800 rounded-2xl shadow-lg overflow-x-auto">
            <table className="w-full text-left">
                <thead className="border-b border-gray-700">
                    <tr>
                        <th className="p-4">Item Name</th>
                        <th className="p-4">In Stock</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {inventory.map(item => (
                        <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="p-4">{item.name}</td>
                            <td className="p-4 font-semibold">{item.stock}</td>
                            <td className="p-4">
                                {item.stock > item.lowStockThreshold ? (
                                    <span className="text-green-400 font-semibold">In Stock</span>
                                ) : (
                                    <span className="text-red-400 font-semibold flex items-center"><AlertCircle size={16} className="mr-2"/>Low Stock</span>
                                )}
                            </td>
                            <td className="p-4 text-right space-x-2">
                                <button onClick={() => onEdit(item)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full hover:bg-blue-500/10"><Edit2 size={18} /></button>
                                <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-500/10"><Trash2 size={18} /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// -- EXPENSES VIEW COMPONENT -- //
const ExpensesView = ({ expenses, onDelete, onAdd, onEdit }) => {
    const [selectedCategory, setSelectedCategory] = useState('All');
    
    const categories = ['All', ...Array.from(new Set(expenses.map(e => e.category)))];
    
    const filteredExpenses = selectedCategory === 'All' 
        ? expenses 
        : expenses.filter(e => e.category === selectedCategory);

    const totalAmount = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-amber-400">Expenses</h2>
                <button onClick={onAdd} className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg flex items-center space-x-2 hover:bg-amber-400 transition-colors shadow-md">
                    <PlusCircle size={20} />
                    <span>Add Expense</span>
                </button>
            </div>

            <div className="bg-gray-800 p-4 rounded-2xl shadow-lg">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="font-semibold mr-2">Filter by category:</span>
                    {categories.map(category => (
                        <button 
                            key={category} 
                            onClick={() => setSelectedCategory(category)}
                            className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${selectedCategory === category ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
                <div className="text-right text-lg">
                    Total for <span className="font-bold text-amber-400">{selectedCategory}</span>: <span className="font-semibold text-red-400">{totalAmount.toFixed(2)} MAD</span>
                </div>
            </div>

            <div className="bg-gray-800 rounded-2xl shadow-lg overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-gray-700">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Description</th>
                            <th className="p-4">Amount</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredExpenses.map(expense => (
                            <tr key={expense.id} className={`border-b border-gray-700 ${expense.isAuto ? 'bg-gray-700/30' : 'hover:bg-gray-700/50'}`}>
                                <td className="p-4">{expense.date}</td>
                                <td className="p-4">{expense.category}</td>
                                <td className="p-4 text-gray-400">{expense.description}</td>
                                <td className="p-4 font-semibold text-red-400">-{expense.amount.toFixed(2)} MAD</td>
                                <td className="p-4 text-right space-x-2">
                                    {expense.isAuto ? (
                                        <span className="text-gray-500 p-2 inline-flex items-center"><Lock size={16} className="mr-2"/>Auto</span>
                                    ) : (
                                        <>
                                            <button onClick={() => onEdit(expense)} className="text-blue-400 hover:text-blue-300 p-2 rounded-full hover:bg-blue-500/10"><Edit2 size={18} /></button>
                                            <button onClick={() => onDelete(expense.id)} className="text-red-400 hover:text-red-300 p-2 rounded-full hover:bg-red-500/10"><Trash2 size={18} /></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// -- FORM COMPONENTS -- //
const OrderForm = ({ products, order, onSubmit, onCancel }) => {
    const [customerName, setCustomerName] = useState(order?.customerName || '');
    const [city, setCity] = useState(order?.city || '');
    const [items, setItems] = useState(order?.items || [{ productId: '', qty: 1 }]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const orderItems = items.map(item => {
            if (!item.productId) return null;
            const product = products.find(p => p.id === item.productId);
            if (!product) return null;
            return { productName: `${product.name} - ${product.color}`, qty: item.qty, price: product.price };
        }).filter(Boolean);

        if (orderItems.length === 0) {
            console.error("No valid products selected for the order.");
            return;
        }

        const total = orderItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const newOrderData = { customerName, city, items: orderItems, total, date: order?.date || new Date().toISOString().split('T')[0] };
        if (!order) {
            newOrderData.status = 'Pending';
        }
        onSubmit(newOrderData);
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-amber-400">{order ? 'Edit' : 'New'} Order</h3>
                <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>
            <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <select value={items[0].productId || ''} onChange={e => setItems([{ ...items[0], productId: e.target.value }])} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required>
                <option value="">Select a Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} - {p.color} ({p.price} MAD)</option>)}
            </select>
            <input type="number" placeholder="Quantity" value={items[0].qty} onChange={e => setItems([{ ...items[0], qty: parseInt(e.target.value) || 1 }])} min="1" className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                <button type="submit" className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg hover:bg-amber-400 transition-colors">{order ? 'Save Changes' : 'Add Order'}</button>
            </div>
        </form>
    );
};

const ProductForm = ({ product, onSubmit, onCancel }) => {
    const [name, setName] = useState(product?.name || '');
    const [color, setColor] = useState(product?.color || '');
    const [price, setPrice] = useState(product?.price || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, color, price: parseFloat(price) });
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-amber-400">{product ? 'Edit' : 'New'} Product</h3>
                <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>
            <input type="text" placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <input type="text" placeholder="Color (e.g., Brown, Black)" value={color} onChange={e => setColor(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <input type="number" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} step="0.01" min="0" className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                <button type="submit" className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg hover:bg-amber-400 transition-colors">{product ? 'Save Changes' : 'Add Product'}</button>
            </div>
        </form>
    );
};


const InventoryForm = ({ item, onSubmit, onCancel }) => {
    const [name, setName] = useState(item?.name || '');
    const [stock, setStock] = useState(item?.stock || '');
    const [lowStockThreshold, setLowStockThreshold] = useState(item?.lowStockThreshold || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, stock: parseInt(stock), lowStockThreshold: parseInt(lowStockThreshold) });
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-amber-400">{item ? 'Edit' : 'Add'} Inventory Item</h3>
                <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>
            <input type="text" placeholder="Item Name" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <input type="number" placeholder="Stock Quantity" value={stock} onChange={e => setStock(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <input type="number" placeholder="Low Stock Threshold" value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                <button type="submit" className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg hover:bg-amber-400 transition-colors">{item ? 'Save Changes' : 'Add Item'}</button>
            </div>
        </form>
    );
};

const ExpenseForm = ({ expense, onSubmit, onCancel }) => {
    const [date, setDate] = useState(expense?.date || new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState(expense?.category || 'Materials');
    const [description, setDescription] = useState(expense?.description || '');
    const [amount, setAmount] = useState(expense?.amount || '');
    const [platform, setPlatform] = useState(expense?.platform || 'Facebook');
    const [campaign, setCampaign] = useState(expense?.campaign || '');


    const handleSubmit = (e) => {
        e.preventDefault();
        let finalDescription = description;
        if (category === 'Marketing') {
            finalDescription = `[${platform}] ${campaign}`;
        }
        onSubmit({ date, category, description: finalDescription, amount: parseFloat(amount), platform, campaign });
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-amber-400">{expense ? 'Edit' : 'New'} Expense</h3>
                <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required>
                <option>Materials</option>
                <option>Shipping</option>
                <option>Marketing</option>
                <option>Tools</option>
                <option>Other</option>
            </select>

            {category === 'Marketing' ? (
                <>
                    <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none">
                        <option>Facebook</option>
                        <option>Instagram</option>
                        <option>TikTok</option>
                        <option>Other</option>
                    </select>
                    <input type="text" placeholder="Campaign Name / Description" value={campaign} onChange={e => setCampaign(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                </>
            ) : (
                 <input type="text" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            )}

            <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" min="0" className="w-full p-2 bg-gray-700 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
            <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                <button type="submit" className="bg-amber-500 text-gray-900 font-bold py-2 px-4 rounded-lg hover:bg-amber-400 transition-colors">{expense ? 'Save Changes' : 'Add Expense'}</button>
            </div>
        </form>
    );
};
