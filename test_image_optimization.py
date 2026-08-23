#!/usr/bin/env python3
"""
Backend Test Script for v3.47 Package Image Optimization
Tests automatic image optimization with sharp (resize 1200px + WebP q82)
"""

import requests
import base64
import io
import json
from PIL import Image, ImageDraw
import sys

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
CREDENTIALS = {
    "email": "owner@demo.com",
    "password": "Demo@2025"
}

# Global session
session = requests.Session()
test_package_id = None

def log(msg):
    """Print test log message"""
    print(f"[TEST] {msg}")

def generate_test_image(width, height, format='JPEG'):
    """Generate a test image with gradient fill (realistic size)"""
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    
    # Create gradient with noise for realistic file size
    for y in range(height):
        for x in range(width):
            r = int((x / width) * 255)
            g = int((y / height) * 255)
            b = int(((x + y) / (width + height)) * 255)
            draw.point((x, y), fill=(r, g, b))
    
    # Add some text for variety
    draw.text((width//2, height//2), f"{width}x{height}", fill=(255, 255, 255))
    
    # Convert to base64 data URL
    buffer = io.BytesIO()
    img.save(buffer, format=format, quality=95)
    buffer.seek(0)
    img_bytes = buffer.read()
    b64 = base64.b64encode(img_bytes).decode('utf-8')
    
    mime_type = f"image/{format.lower()}" if format != 'JPEG' else "image/jpeg"
    data_url = f"data:{mime_type};base64,{b64}"
    
    log(f"Generated {width}x{height} {format} image: {len(img_bytes)} bytes, base64: {len(b64)} chars")
    return data_url, len(img_bytes)

def login():
    """Login and get session cookie"""
    try:
        log("Logging in as owner@demo.com...")
        resp = session.post(f"{BASE_URL}/auth/login", json=CREDENTIALS, timeout=10)
        if resp.status_code == 200:
            log("✅ Login successful")
            return True
        else:
            log(f"❌ Login failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Login error: {e}")
        return False

def create_test_package():
    """Create a test package for image testing"""
    global test_package_id
    try:
        log("Creating test package...")
        payload = {
            "name": "TEST Image Optimization Package v3.47",
            "package_type": "umrah",
            "currency": "SAR",
            "notes": "Automated test package for image optimization"
        }
        resp = session.post(f"{BASE_URL}/packages", json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            test_package_id = data.get('id')
            log(f"✅ Test package created: {test_package_id}")
            return True
        else:
            log(f"❌ Package creation failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        log(f"❌ Package creation error: {e}")
        return False

def test_scenario_1_large_landscape():
    """Test 1: Large landscape image (3000x2000 JPEG) → expect 1200x800 WebP"""
    log("\n=== TEST 1: Large landscape image (3000x2000 JPEG) ===")
    try:
        data_url, original_size = generate_test_image(3000, 2000, 'JPEG')
        
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": data_url},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ FAILED: {resp.status_code} - {resp.text}")
            return False
        
        result = resp.json()
        log(f"Response: {json.dumps(result, indent=2)}")
        
        # Verify response structure
        if not result.get('saved'):
            log("❌ FAILED: saved != true")
            return False
        
        opt = result.get('optimized', {})
        if opt.get('width') != 1200:
            log(f"❌ FAILED: Expected width=1200, got {opt.get('width')}")
            return False
        
        if opt.get('height') != 800:
            log(f"❌ FAILED: Expected height=800, got {opt.get('height')}")
            return False
        
        if opt.get('format') != 'webp':
            log(f"❌ FAILED: Expected format=webp, got {opt.get('format')}")
            return False
        
        if opt.get('bytes') >= original_size:
            log(f"❌ FAILED: Optimized size ({opt.get('bytes')}) not smaller than original ({original_size})")
            return False
        
        log(f"✅ PASSED: 3000x2000 → 1200x800 WebP, {original_size} → {opt.get('bytes')} bytes")
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_2_portrait():
    """Test 2: Portrait image (1500x3000 PNG) → expect 600x1200 WebP"""
    log("\n=== TEST 2: Portrait image (1500x3000 PNG) ===")
    try:
        data_url, original_size = generate_test_image(1500, 3000, 'PNG')
        
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": data_url},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ FAILED: {resp.status_code} - {resp.text}")
            return False
        
        result = resp.json()
        opt = result.get('optimized', {})
        
        if opt.get('width') != 600 or opt.get('height') != 1200:
            log(f"❌ FAILED: Expected 600x1200, got {opt.get('width')}x{opt.get('height')}")
            return False
        
        if opt.get('format') != 'webp':
            log(f"❌ FAILED: Expected format=webp, got {opt.get('format')}")
            return False
        
        log(f"✅ PASSED: 1500x3000 PNG → 600x1200 WebP, {original_size} → {opt.get('bytes')} bytes")
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_3_small_no_enlargement():
    """Test 3: Small image (400x300 JPEG) → expect NO enlargement, 400x300 WebP"""
    log("\n=== TEST 3: Small image (400x300 JPEG) - no enlargement ===")
    try:
        data_url, original_size = generate_test_image(400, 300, 'JPEG')
        
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": data_url},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ FAILED: {resp.status_code} - {resp.text}")
            return False
        
        result = resp.json()
        opt = result.get('optimized', {})
        
        if opt.get('width') != 400 or opt.get('height') != 300:
            log(f"❌ FAILED: Expected 400x300 (no enlargement), got {opt.get('width')}x{opt.get('height')}")
            return False
        
        if opt.get('format') != 'webp':
            log(f"❌ FAILED: Expected format=webp, got {opt.get('format')}")
            return False
        
        log(f"✅ PASSED: 400x300 JPEG → 400x300 WebP (no enlargement), {original_size} → {opt.get('bytes')} bytes")
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_4_normal():
    """Test 4: Normal image (1200x800) → stays 1200x800 WebP"""
    log("\n=== TEST 4: Normal image (1200x800 JPEG) ===")
    try:
        data_url, original_size = generate_test_image(1200, 800, 'JPEG')
        
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": data_url},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ FAILED: {resp.status_code} - {resp.text}")
            return False
        
        result = resp.json()
        opt = result.get('optimized', {})
        
        if opt.get('width') != 1200 or opt.get('height') != 800:
            log(f"❌ FAILED: Expected 1200x800, got {opt.get('width')}x{opt.get('height')}")
            return False
        
        if opt.get('format') != 'webp':
            log(f"❌ FAILED: Expected format=webp, got {opt.get('format')}")
            return False
        
        log(f"✅ PASSED: 1200x800 JPEG → 1200x800 WebP, {original_size} → {opt.get('bytes')} bytes")
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_5_serve_endpoints():
    """Test 5: Serve endpoints - GET /api/packages/:id/image and public endpoint"""
    log("\n=== TEST 5: Serve endpoints ===")
    try:
        # Test authenticated endpoint
        log("Testing GET /api/packages/:id/image (authenticated)...")
        resp = session.get(f"{BASE_URL}/packages/{test_package_id}/image", timeout=10)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: {resp.status_code} - {resp.text}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        if 'image/webp' not in content_type:
            log(f"❌ FAILED: Expected Content-Type image/webp, got {content_type}")
            return False
        
        # Check if it's a valid WebP (starts with RIFF...WEBP)
        content = resp.content
        if not (content[:4] == b'RIFF' and content[8:12] == b'WEBP'):
            log(f"❌ FAILED: Response is not a valid WebP image")
            return False
        
        log(f"✅ Authenticated endpoint works: {len(content)} bytes, Content-Type: {content_type}")
        
        # Test public endpoint (requires meraaj.shared=true)
        log("Testing GET /api/meraaj/packages/:id/image (public)...")
        # First, we need to mark the package as shared in MongoDB
        # For now, just test that it returns 404 when not shared
        resp2 = session.get(f"{BASE_URL}/meraaj/packages/{test_package_id}/image", timeout=10)
        
        if resp2.status_code == 404:
            log(f"✅ Public endpoint correctly returns 404 when package not shared")
        elif resp2.status_code == 200:
            content_type2 = resp2.headers.get('Content-Type', '')
            if 'image/webp' in content_type2:
                log(f"✅ Public endpoint works: {len(resp2.content)} bytes, Content-Type: {content_type2}")
            else:
                log(f"❌ FAILED: Public endpoint wrong Content-Type: {content_type2}")
                return False
        else:
            log(f"⚠️  Public endpoint returned {resp2.status_code} (expected 404 or 200)")
        
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_6_invalid_input():
    """Test 6: Invalid input - wrong MIME type and corrupt base64"""
    log("\n=== TEST 6: Invalid input handling ===")
    try:
        # Test 6a: Wrong MIME type
        log("Testing invalid MIME type (text/plain)...")
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": "data:text/plain;base64,aGVsbG8gd29ybGQ="},
            timeout=10
        )
        
        if resp.status_code != 400:
            log(f"❌ FAILED: Expected 400 for invalid MIME, got {resp.status_code}")
            return False
        
        log(f"✅ Invalid MIME type correctly rejected with 400")
        
        # Test 6b: Corrupt base64 claiming to be image
        log("Testing corrupt base64 (claiming image/jpeg)...")
        corrupt_data = "data:image/jpeg;base64," + base64.b64encode(b"hello world not an image").decode('utf-8')
        resp2 = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": corrupt_data},
            timeout=10
        )
        
        if resp2.status_code != 400:
            log(f"❌ FAILED: Expected 400 for corrupt image, got {resp2.status_code}")
            return False
        
        error_msg = resp2.text
        if 'معالجة' in error_msg or 'processing' in error_msg.lower():
            log(f"✅ Corrupt image correctly rejected with 400 and processing error message")
        else:
            log(f"✅ Corrupt image correctly rejected with 400")
        
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        return False

def test_scenario_7_meraaj_sync():
    """Test 7: Meraaj sync - verify package.updated event with images URL"""
    log("\n=== TEST 7: Meraaj sync integrity ===")
    try:
        # This requires direct MongoDB access to:
        # 1. Mark package as meraaj.shared=true
        # 2. Upload an image
        # 3. Check meraaj_events for package.updated event with images array
        
        log("⚠️  Meraaj sync test requires MongoDB direct access")
        log("Testing via MongoDB connection...")
        
        from pymongo import MongoClient
        import os
        
        mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.getenv('DB_NAME', 'your_database_name')
        
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # Get the package to find tenant_id
        pkg = db.packages.find_one({'id': test_package_id})
        if not pkg:
            log(f"❌ FAILED: Package not found in MongoDB")
            return False
        
        tenant_id = pkg.get('tenant_id')
        
        # Mark as shared
        log(f"Marking package as meraaj.shared=true...")
        db.packages.update_one(
            {'id': test_package_id},
            {'$set': {'meraaj.shared': True, 'meraaj.registered_at': None}}
        )
        
        # Upload a new image to trigger event
        log("Uploading image to trigger package.updated event...")
        data_url, _ = generate_test_image(800, 600, 'JPEG')
        resp = session.post(
            f"{BASE_URL}/packages/{test_package_id}/image",
            json={"data": data_url},
            timeout=30
        )
        
        if resp.status_code != 200:
            log(f"❌ FAILED: Image upload failed: {resp.status_code}")
            return False
        
        # Check for package.updated event in meraaj_events
        log("Checking meraaj_events for package.updated event...")
        events = list(db.meraaj_events.find({
            'tenant_id': tenant_id,
            'type': 'package.updated'
        }).sort('created_at', -1).limit(5))
        
        if not events:
            log(f"❌ FAILED: No package.updated events found")
            return False
        
        # Find the most recent event for our package
        latest_event = None
        for evt in events:
            payload = evt.get('payload', {})
            if payload.get('package_ref') == test_package_id:
                latest_event = evt
                break
        
        if not latest_event:
            log(f"❌ FAILED: No package.updated event found for test package")
            return False
        
        payload = latest_event.get('payload', {})
        images = payload.get('images', [])
        
        log(f"Event payload images: {images}")
        
        if not images:
            log(f"❌ FAILED: images array is empty in package.updated event")
            return False
        
        expected_url = f"https://visa-booking-5.preview.emergentagent.com/api/meraaj/packages/{test_package_id}/image"
        if expected_url not in images:
            log(f"❌ FAILED: Expected image URL not in images array")
            log(f"Expected: {expected_url}")
            log(f"Got: {images}")
            return False
        
        log(f"✅ PASSED: package.updated event contains correct image URL")
        
        # Test public endpoint now that package is shared
        log("Testing public endpoint with shared package...")
        resp2 = session.get(f"{BASE_URL}/meraaj/packages/{test_package_id}/image", timeout=10)
        
        if resp2.status_code != 200:
            log(f"❌ FAILED: Public endpoint returned {resp2.status_code} for shared package")
            return False
        
        content_type = resp2.headers.get('Content-Type', '')
        if 'image/webp' not in content_type:
            log(f"❌ FAILED: Public endpoint wrong Content-Type: {content_type}")
            return False
        
        log(f"✅ Public endpoint works for shared package: {len(resp2.content)} bytes")
        
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_scenario_8_regression():
    """Test 8: Regression tests - GET /api/packages and package delete"""
    log("\n=== TEST 8: Regression tests ===")
    try:
        # Test GET /api/packages
        log("Testing GET /api/packages...")
        resp = session.get(f"{BASE_URL}/packages", timeout=10)
        
        if resp.status_code != 200:
            log(f"❌ FAILED: GET /api/packages returned {resp.status_code}")
            return False
        
        packages = resp.json()
        if not isinstance(packages, list):
            log(f"❌ FAILED: GET /api/packages did not return array")
            return False
        
        log(f"✅ GET /api/packages works: {len(packages)} packages")
        
        # Test package delete
        log("Testing DELETE /api/packages/:id...")
        
        # First, unset meraaj.shared if set (via MongoDB)
        try:
            from pymongo import MongoClient
            import os
            
            mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.getenv('DB_NAME', 'your_database_name')
            
            client = MongoClient(mongo_url)
            db = client[db_name]
            
            log("Unsetting meraaj.shared before delete...")
            db.packages.update_one(
                {'id': test_package_id},
                {'$unset': {'meraaj': ''}}
            )
        except Exception as e:
            log(f"⚠️  Could not unset meraaj.shared via MongoDB: {e}")
        
        resp2 = session.delete(f"{BASE_URL}/packages/{test_package_id}", timeout=10)
        
        if resp2.status_code != 200:
            log(f"❌ FAILED: DELETE /api/packages/:id returned {resp2.status_code} - {resp2.text}")
            return False
        
        result = resp2.json()
        if not result.get('success'):
            log(f"❌ FAILED: Delete did not return success=true")
            return False
        
        log(f"✅ DELETE /api/packages/:id works")
        
        # Verify package is deleted
        resp3 = session.get(f"{BASE_URL}/packages", timeout=10)
        packages_after = resp3.json()
        
        if any(p.get('id') == test_package_id for p in packages_after):
            log(f"❌ FAILED: Package still exists after delete")
            return False
        
        log(f"✅ Package successfully deleted and cleaned up")
        
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_mongodb_data():
    """Verify MongoDB data for the uploaded image"""
    log("\n=== Verifying MongoDB data ===")
    try:
        from pymongo import MongoClient
        import os
        
        mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.getenv('DB_NAME', 'your_database_name')
        
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # Get package_images document
        img_doc = db.package_images.find_one({'package_id': test_package_id})
        
        if not img_doc:
            log(f"❌ FAILED: No image document found in package_images")
            return False
        
        log(f"Image document fields: {list(img_doc.keys())}")
        
        # Verify required fields
        required_fields = ['content_type', 'width', 'height', 'original_bytes', 'optimized_bytes']
        for field in required_fields:
            if field not in img_doc:
                log(f"❌ FAILED: Missing field '{field}' in package_images document")
                return False
        
        # Verify values
        if img_doc['content_type'] != 'image/webp':
            log(f"❌ FAILED: content_type is '{img_doc['content_type']}', expected 'image/webp'")
            return False
        
        if img_doc['width'] != 1200 or img_doc['height'] != 800:
            log(f"❌ FAILED: Dimensions are {img_doc['width']}x{img_doc['height']}, expected 1200x800")
            return False
        
        if img_doc['optimized_bytes'] >= img_doc['original_bytes']:
            log(f"❌ FAILED: optimized_bytes ({img_doc['optimized_bytes']}) >= original_bytes ({img_doc['original_bytes']})")
            return False
        
        log(f"✅ MongoDB data verified:")
        log(f"   content_type: {img_doc['content_type']}")
        log(f"   dimensions: {img_doc['width']}x{img_doc['height']}")
        log(f"   original_bytes: {img_doc['original_bytes']}")
        log(f"   optimized_bytes: {img_doc['optimized_bytes']}")
        log(f"   compression ratio: {img_doc['optimized_bytes'] / img_doc['original_bytes']:.2%}")
        
        return True
        
    except Exception as e:
        log(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    log("=" * 80)
    log("Backend Test: v3.47 Package Image Optimization")
    log("=" * 80)
    
    # Login
    if not login():
        log("\n❌ TEST SUITE FAILED: Could not login")
        sys.exit(1)
    
    # Create test package
    if not create_test_package():
        log("\n❌ TEST SUITE FAILED: Could not create test package")
        sys.exit(1)
    
    # Run all test scenarios
    results = {
        "Test 1: Large landscape (3000x2000 → 1200x800)": test_scenario_1_large_landscape(),
        "Test 2: Portrait (1500x3000 → 600x1200)": test_scenario_2_portrait(),
        "Test 3: Small no enlargement (400x300 → 400x300)": test_scenario_3_small_no_enlargement(),
        "Test 4: Normal (1200x800 → 1200x800)": test_scenario_4_normal(),
        "MongoDB data verification": verify_mongodb_data(),
        "Test 5: Serve endpoints": test_scenario_5_serve_endpoints(),
        "Test 6: Invalid input handling": test_scenario_6_invalid_input(),
        "Test 7: Meraaj sync integrity": test_scenario_7_meraaj_sync(),
        "Test 8: Regression tests": test_scenario_8_regression(),
    }
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{status}: {test_name}")
    
    log(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        log(f"\n❌ {total - passed} TEST(S) FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
