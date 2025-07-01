const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

let db = { products: [] };

const loadDatabase = () => {
    try {
        const data = fs.readFileSync('database.json', 'utf8');
        db = JSON.parse(data);
    } catch (err) {
        console.log('No database file found, starting with empty database');
        saveDatabase();
    }
};

const saveDatabase = () => {
    fs.writeFileSync('database.json', JSON.stringify(db, null, 2));
};

loadDatabase();

// API Endpoints
app.get('/api/products', (req, res) => {
    res.json(db.products);
});

app.get('/api/products/:id', (req, res) => {
    const product = db.products.find(p => p.id == req.params.id);
    if (product) {
        res.json(product);
    } else {
        res.status(404).json({ error: 'Product not found' });
    }
});

app.post('/api/products', upload.array('images', 10), (req, res) => {
    try {
        const { name, price, description } = req.body;
        
        if (!name || !price || !req.files || req.files.length === 0) {
            // Clean up uploaded files if validation fails
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(400).json({ error: 'Name, price, and at least one image are required' });
        }

        const images = req.files.map(file => file.filename);
        
        const newProduct = {
            id: Date.now().toString(),
            name,
            price: parseFloat(price),
            description: description || '',
            images
        };
        
        db.products.push(newProduct);
        saveDatabase();
        
        res.status(201).json(newProduct);
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/products/:id', upload.array('images', 10), (req, res) => {
    try {
        const { name, price, description } = req.body;
        const productId = req.params.id;
        const productIndex = db.products.findIndex(p => p.id == productId);
        
        if (productIndex === -1) {
            // Clean up uploaded files if product not found
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(404).json({ error: 'Product not found' });
        }
        
        let images = [...db.products[productIndex].images];
        
        if (req.files && req.files.length > 0) {
            images = [...images, ...req.files.map(file => file.filename)];
        }
        
        const updatedProduct = {
            ...db.products[productIndex],
            name,
            price: parseFloat(price),
            description: description || '',
            images
        };
        
        db.products[productIndex] = updatedProduct;
        saveDatabase();
        
        res.json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/products/:id', (req, res) => {
    try {
        const productId = req.params.id;
        const productIndex = db.products.findIndex(p => p.id == productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Delete associated images
        const product = db.products[productIndex];
        if (product.images && product.images.length > 0) {
            product.images.forEach(image => {
                const imagePath = path.join(__dirname, 'uploads', image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            });
        }
        
        db.products.splice(productIndex, 1);
        saveDatabase();
        
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
