/**
 * Vietnam Mega-Sale 11.11 Flash Deal Catalog & Pricing Contracts
 * Simulates Shopee 11.11 / Lazada Midnight Mega Flash Sale in VND (₫).
 * 
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

/**
 * Format currency number into Vietnamese Dong standard notation (e.g. 11.111.111 ₫)
 * @param {number} amount
 * @returns {string}
 */
export function formatVND(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Vietnam 11.11 Flash Sale Official Product Lineup
 * Limited stock items designed to test high-concurrency race conditions.
 */
export const FLASH_DEAL_CATALOG = [
  {
    id: 'sp-ip16pm',
    title: 'iPhone 16 Pro Max 256GB - Titan Sa Mạc (Chính Hãng VN/A)',
    brand: 'Apple',
    category: 'Smartphone',
    originalPrice: 34990000,
    flashPrice: 11111111,
    discountPercent: 68,
    totalStock: 3,
    badge: 'DEAL HỦY DIỆT',
    emoji: '📱'
  },
  {
    id: 'sp-sony-xm5',
    title: 'Tai Nghe Chống Ồn Cao Cấp Sony WH-1000XM5 Hi-Res Audio',
    brand: 'Sony',
    category: 'Audio',
    originalPrice: 7990000,
    flashPrice: 2990000,
    discountPercent: 63,
    totalStock: 5,
    badge: 'HOT SALE',
    emoji: '🎧'
  },
  {
    id: 'sp-mac-air-m3',
    title: 'Apple MacBook Air 13 M3 (16GB RAM / 512GB SSD - Midnight)',
    brand: 'Apple',
    category: 'Laptop',
    originalPrice: 32990000,
    flashPrice: 19990000,
    discountPercent: 39,
    totalStock: 4,
    badge: 'GIẢM SỐC',
    emoji: '💻'
  },
  {
    id: 'sp-keychron-q1',
    title: 'Bàn Phím Cơ Custom Keychron Q1 Pro Wireless QMK/VIA RGB',
    brand: 'Keychron',
    category: 'Gear',
    originalPrice: 4590000,
    flashPrice: 1490000,
    discountPercent: 68,
    totalStock: 6,
    badge: 'FLASH DEAL',
    emoji: '⌨️'
  },
  {
    id: 'sp-dyson-v12',
    title: 'Máy Hút Bụi Không Dây Dyson V12 Detect Slim Fluffy Laser',
    brand: 'Dyson',
    category: 'Home',
    originalPrice: 18990000,
    flashPrice: 8990000,
    discountPercent: 53,
    totalStock: 2,
    badge: 'CỰC HIẾM',
    emoji: '🌀'
  },
  {
    id: 'sp-jordan-1',
    title: 'Giày Thể Thao Nike Air Jordan 1 Low Retro OG Panda',
    brand: 'Nike',
    category: 'Fashion',
    originalPrice: 3890000,
    flashPrice: 999000,
    discountPercent: 74,
    totalStock: 8,
    badge: 'ĐỘC QUYỀN 11.11',
    emoji: '👟'
  }
];

export const VOUCHER_LIST = [
  { code: 'SHOPEE1111', discountVND: 500000, minOrderVND: 2000000, label: 'Giảm 500k đơn từ 2tr' },
  { code: 'FREESHIPMAX', discountVND: 70000, minOrderVND: 0, label: 'Miễn phí vận chuyển toàn quốc' },
  { code: 'HOANXU111K', discountVND: 111000, minOrderVND: 500000, label: 'Hoàn 111k Xu Shopee' }
];
