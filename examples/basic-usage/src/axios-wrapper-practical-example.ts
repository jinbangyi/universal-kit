/**
 * Practical Example: Building a Complete API Client with AxiosWrapper
 *
 * This example shows how to build a production-ready API client for a
 * fictional e-commerce service with automatic metrics collection.
 */

import { AxiosWrapper, AxiosWrapperRequestConfig } from '@universal-kit/metrics-client';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Product types
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateProductRequest {
  name: string;
  price: number;
  category: string;
  description: string;
}

interface UpdateProductRequest {
  name?: string;
  price?: number;
  category?: string;
  description?: string;
  inStock?: boolean;
}

// Order types
interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface CreateOrderRequest {
  customerId: string;
  items: OrderItem[];
}

// User types
interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'admin';
  createdAt: string;
}

// API Response types
interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ApiConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
  retryAttempts: number;
  enableLogging: boolean;
}

// Mock API configuration (replace with actual values)
const API_CONFIG: ApiConfig = {
  baseURL: 'https://api.ecommerce.example.com',
  apiKey: 'prod-api-key-123456',
  timeout: 10000,
  retryAttempts: 3,
  enableLogging: true,
};

// ============================================================================
// MAIN API CLIENT CLASS
// ============================================================================

class EcommerceApiClient {
  private client: AxiosWrapper;
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;

    // Initialize AxiosWrapper with provider monitoring
    this.client = new AxiosWrapper({
      provider: 'ecommerce-api',
      apiKeyHeader: 'x-api-key',
      retryConfig: {
        attempts: config.retryAttempts,
        delay: 1000,
      },
      traceFailedRequests: true,
      logRequestEvents: config.enableLogging,
    });

    // Configure base settings
    this.setupBaseConfiguration();
    this.setupInterceptors();
  }

  private setupBaseConfiguration(): void {
    const axiosInstance = this.client.getAxiosInstance();

    // Set base URL
    axiosInstance.defaults.baseURL = this.config.baseURL;

    // Set default headers
    axiosInstance.defaults.headers.common['x-api-key'] = this.config.apiKey;
    axiosInstance.defaults.headers.common['Content-Type'] = 'application/json';
    axiosInstance.defaults.headers.common['Accept'] = 'application/json';

    // Set timeout
    axiosInstance.defaults.timeout = this.config.timeout;
  }

  private setupInterceptors(): void {
    const axiosInstance = this.client.getAxiosInstance();

    // Request interceptor: Add request ID and logging
    axiosInstance.interceptors.request.use(
      (config) => {
        if (this.config.enableLogging) {
          console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor: Log responses and handle errors
    axiosInstance.interceptors.response.use(
      (response) => {
        if (this.config.enableLogging) {
          console.log(`✅ API Response: ${response.status} ${response.config.url}`);
          const metrics = (response as any)._metrics;
          if (metrics) {
            console.log(`⏱️  Duration: ${metrics.duration}ms`);
          }
        }
        return response;
      },
      (error) => {
        if (this.config.enableLogging) {
          console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
          const metrics = (error as any)._metrics;
          if (metrics) {
            console.log(`⏱️  Duration: ${metrics.duration}ms`);
            console.log(`🔥 Error: ${error.message}`);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // ============================================================================
  // PRODUCT MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get all products with optional filtering
   */
  async getProducts(params?: {
    category?: string;
    inStock?: boolean;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Product>> {
    const config: AxiosWrapperRequestConfig = {
      params,
    };

    try {
      const response = await this.client.get<ApiResponse<PaginatedResponse<Product>>>('/products', config);
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch products:', error);
      throw error;
    }
  }

  /**
   * Get a single product by ID
   */
  async getProduct(id: string): Promise<Product> {
    try {
      const response = await this.client.get<ApiResponse<Product>>(`/products/${id}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to fetch product ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new product
   */
  async createProduct(productData: CreateProductRequest): Promise<Product> {
    try {
      const response = await this.client.post<ApiResponse<Product>>('/products', productData);
      console.log(`✅ Created product: ${response.data.data.name}`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to create product:', error);
      throw error;
    }
  }

  /**
   * Update an existing product
   */
  async updateProduct(id: string, updateData: UpdateProductRequest): Promise<Product> {
    try {
      const response = await this.client.put<ApiResponse<Product>>(`/products/${id}`, updateData);
      console.log(`✅ Updated product: ${response.data.data.name}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to update product ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a product
   */
  async deleteProduct(id: string): Promise<void> {
    try {
      await this.client.delete(`/products/${id}`);
      console.log(`✅ Deleted product: ${id}`);
    } catch (error) {
      console.error(`Failed to delete product ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // ORDER MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get all orders for a customer
   */
  async getOrders(customerId: string, status?: string): Promise<Order[]> {
    const params = status ? { customerId, status } : { customerId };

    try {
      const response = await this.client.get<ApiResponse<Order[]>>('/orders', { params });
      return response.data.data;
    } catch (error) {
      console.error(`Failed to fetch orders for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific order
   */
  async getOrder(orderId: string): Promise<Order> {
    try {
      const response = await this.client.get<ApiResponse<Order>>(`/orders/${orderId}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to fetch order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new order
   */
  async createOrder(orderData: CreateOrderRequest): Promise<Order> {
    try {
      const response = await this.client.post<ApiResponse<Order>>('/orders', orderData);
      console.log(`✅ Created order: ${response.data.data.id}`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to create order:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
    try {
      const response = await this.client.patch<ApiResponse<Order>>(`/orders/${orderId}/status`, { status });
      console.log(`✅ Updated order ${orderId} status to: ${status}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to update order ${orderId} status:`, error);
      throw error;
    }
  }

  // ============================================================================
  // USER MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<User> {
    try {
      const response = await this.client.get<ApiResponse<User>>(`/users/${userId}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to fetch user profile ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, userData: Partial<User>): Promise<User> {
    try {
      const response = await this.client.put<ApiResponse<User>>(`/users/${userId}`, userData);
      console.log(`✅ Updated user profile: ${userId}`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to update user profile ${userId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // SEARCH AND FILTERING METHODS
  // ============================================================================

  /**
   * Search products
   */
  async searchProducts(query: string, filters?: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
  }): Promise<PaginatedResponse<Product>> {
    const params = { query, ...filters };

    try {
      const response = await this.client.get<ApiResponse<PaginatedResponse<Product>>>('/products/search', { params });
      return response.data.data;
    } catch (error) {
      console.error(`Failed to search products with query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Get product categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const response = await this.client.get<ApiResponse<string[]>>('/categories');
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Update multiple products in bulk
   */
  async bulkUpdateProducts(updates: { id: string; data: UpdateProductRequest }[]): Promise<Product[]> {
    try {
      const response = await this.client.post<ApiResponse<Product[]>>('/products/bulk-update', { updates });
      console.log(`✅ Bulk updated ${updates.length} products`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to bulk update products:', error);
      throw error;
    }
  }

  /**
   * Get inventory levels for multiple products
   */
  async getInventoryLevels(productIds: string[]): Promise<{ productId: string; quantity: number; inStock: boolean }[]> {
    try {
      const response = await this.client.post<ApiResponse<{ productId: string; quantity: number; inStock: boolean }[]>>('/products/inventory', { productIds });
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch inventory levels:', error);
      throw error;
    }
  }

  // ============================================================================
  // METRICS AND MONITORING
  // ============================================================================

  /**
   * Get API metrics for monitoring
   */
  getMetrics() {
    return {
      providerMetrics: this.client.getProviderMetricsManager(),
      requestTracer: this.client.getRequestTracer(),
    };
  }

  /**
   * Get API health status
   */
  async getHealthStatus(): Promise<{ status: string; timestamp: string; services: any[] }> {
    try {
      const response = await this.client.get('/health', { skipMetrics: true }); // Skip metrics for health checks
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'unhealthy', timestamp: new Date().toISOString(), services: [] };
    }
  }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Complete e-commerce workflow
 */
async function ecommerceWorkflow(): Promise<void> {
  console.log('🛒️  Starting E-commerce API Workflow\n');

  // Initialize API client
  const apiClient = new EcommerceApiClient(API_CONFIG);

  try {
    // 1. Get available categories
    console.log('1. Fetching categories...');
    const categories = await apiClient.getCategories();
    console.log('Available categories:', categories);

    // 2. Search for products
    console.log('\n2. Searching for products...');
    const searchResults = await apiClient.searchProducts('phone', {
      category: 'electronics',
      maxPrice: 1000,
      inStock: true,
    });
    console.log(`Found ${searchResults.pagination.total} products`);

    // 3. Get product details
    if (searchResults.data.length > 0) {
      const firstProduct = searchResults.data[0];
      console.log('\n3. Getting product details...');
      const productDetails = await apiClient.getProduct(firstProduct.id);
      console.log('Product details:', productDetails);

      // 4. Create an order
      console.log('\n4. Creating order...');
      const orderData = {
        customerId: 'customer-123',
        items: [
          {
            productId: firstProduct.id,
            quantity: 1,
            price: firstProduct.price,
          },
        ],
      };
      const order = await apiClient.createOrder(orderData);
      console.log('Order created:', order);

      // 5. Get API metrics
      console.log('\n5. API Metrics:');
      const metrics = apiClient.getMetrics();
      console.log('Provider metrics available:', !!metrics.providerMetrics);
      console.log('Request tracer available:', !!metrics.requestTracer);
    }

    // 6. Health check
    console.log('\n6. Health check...');
    const health = await apiClient.getHealthStatus();
    console.log('API Health:', health.status);

    console.log('\n✅ Workflow completed successfully!');

  } catch (error) {
    console.error('\n❌ Workflow failed:', error);
  }
}

/**
 * Example: Error handling with retry logic
 */
async function demonstrateErrorHandling(): Promise<void> {
  console.log('🔧 Demonstrating Error Handling\n');

  const apiClient = new EcommerceApiClient({
    ...API_CONFIG,
    enableLogging: true,
  });

  // Try to access a non-existent endpoint
  try {
    await apiClient.getProduct('non-existent-id');
  } catch (error) {
    console.log('✅ Error caught and handled gracefully');

    // Log error metrics if available
    const errorMetrics = (error as any)._metrics;
    if (errorMetrics) {
      console.log('Error metrics:', {
        requestId: errorMetrics.requestId,
        duration: `${errorMetrics.duration}ms`,
        statusCode: errorMetrics.statusCode,
        error: errorMetrics.error?.message,
      });
    }
  }

  // Try to create an order with invalid data
  try {
    await apiClient.createOrder({
      customerId: '', // Invalid: empty customer ID
      items: [], // Invalid: empty items
    });
  } catch (error) {
    console.log('✅ Validation error caught');
    console.log('Error details:', (error as any).response?.data || error.message);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  EcommerceApiClient,
  ecommerceWorkflow,
  demonstrateErrorHandling,
};

export type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  Order,
  OrderItem,
  CreateOrderRequest,
  User,
  ApiResponse,
  PaginatedResponse,
  ApiConfig,
};