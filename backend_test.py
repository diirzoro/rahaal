#!/usr/bin/env python3
"""
Backend Test Suite for Rahaal ERP v3.23
Tests Package FEATURES + IMAGE endpoints
"""

import requests
import json
import base64
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://visa-booking-5.preview.emergentagent.com/api"
LOGIN_EMAIL = "owner@demo.com"
LOGIN_PASSWORD = "Demo@2025"

# Test state
session = requests.Session()
test_results = []
created_packages = []

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"   {details}")
    test_results.append({"name": name, "passed": passed, "details": details})

def login():
    """Authenticate and get session cookie"""
    print("\n=== AUTHENTICATION ===")
    resp = session.post(f"{BASE_URL}/auth/login", json={
        "email": LOGIN_EMAIL,
        "password": LOGIN_PASSWORD
    })
    if resp.status_code == 200:
        print(f"✅ Logged in as {LOGIN_EMAIL}")
        return True
    else:
        print(f"❌ Login failed: {resp.status_code} - {resp.text}")
        return False

def generate_tiny_png():
    """Generate a tiny 1x1 PNG (base64)"""
    # 1x1 red pixel PNG
    return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

def generate_tiny_jpeg():
    """Generate a tiny JPEG (base64) - different from PNG"""
    # Minimal JPEG (1x1 black pixel)
    return "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="

def test_1_features_on_packages():
    """TEST 1 — FEATURES on packages"""
    print("\n=== TEST 1 — FEATURES ON PACKAGES ===")
    
    # Test 1.1: POST with features (duplicates, whitespace, emojis)
    print("\n1.1 - POST /api/packages with features (duplicates, whitespace, emojis)")
    resp = session.post(f"{BASE_URL}/packages", json={
        "name": "FEAT-v323",
        "package_type": "umrah",
        "currency": "SAR",
        "pricing_mode": "direct",
        "features": [
            "🧳 شنطة سفر",
            "🕋 قريب من الحرم",
            "  custom feature  ",
            "🧳 شنطة سفر"  # duplicate
        ]
    })
    
    if resp.status_code == 200:
        data = resp.json()
        created_packages.append(data['id'])
        features = data.get('features', [])
        
        # Verify: 3 items (duplicate removed, whitespace trimmed)
        expected = ["🧳 شنطة سفر", "🕋 قريب من الحرم", "custom feature"]
        if features == expected and data.get('has_image') == False:
            log_test("POST /packages with features - dedup & trim", True, 
                    f"Features: {features}, has_image: {data.get('has_image')}")
        else:
            log_test("POST /packages with features - dedup & trim", False,
                    f"Expected {expected}, got {features}. has_image: {data.get('has_image')}")
    else:
        log_test("POST /packages with features", False, f"Status {resp.status_code}: {resp.text}")
        return
    
    pkg_id = created_packages[-1]
    
    # Test 1.2: PATCH with features replacement
    print("\n1.2 - PATCH /api/packages/:id with features replacement")
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}", json={
        "features": ["only one"]
    })
    
    if resp.status_code == 200:
        # Verify by GET list
        resp_get = session.get(f"{BASE_URL}/packages")
        if resp_get.status_code == 200:
            packages = resp_get.json()
            pkg = next((p for p in packages if p.get('id') == pkg_id), None)
            if pkg and pkg.get('features') == ["only one"]:
                log_test("PATCH /packages/:id - replace features", True, f"Features: {pkg.get('features')}")
            else:
                log_test("PATCH /packages/:id - replace features", False, f"Expected ['only one'], got {pkg.get('features') if pkg else 'package not found'}")
        else:
            log_test("PATCH /packages/:id - replace features", False, f"GET failed: {resp_get.status_code}")
    else:
        log_test("PATCH /packages/:id - replace features", False, f"Status {resp.status_code}: {resp.text}")
    
    # Test 1.3: PATCH with empty features array
    print("\n1.3 - PATCH with features:[]")
    resp = session.patch(f"{BASE_URL}/packages/{pkg_id}", json={
        "features": []
    })
    
    if resp.status_code == 200:
        resp_get = session.get(f"{BASE_URL}/packages")
        if resp_get.status_code == 200:
            packages = resp_get.json()
            pkg = next((p for p in packages if p.get('id') == pkg_id), None)
            if pkg and pkg.get('features') == []:
                log_test("PATCH with empty features array", True, "Features cleared")
            else:
                log_test("PATCH with empty features array", False, f"Expected [], got {pkg.get('features') if pkg else 'package not found'}")
        else:
            log_test("PATCH with empty features array", False, f"GET failed: {resp_get.status_code}")
    else:
        log_test("PATCH with empty features array", False, f"Status {resp.status_code}: {resp.text}")
    
    # Test 1.4: POST with 40 items (capped at 30) and long item (truncated to 60)
    print("\n1.4 - POST with 40 features (capped at 30) and item > 60 chars (truncated)")
    long_item = "A" * 80  # 80 chars, should be truncated to 60
    features_40 = [f"feature_{i}" for i in range(40)]
    features_40.append(long_item)
    
    resp = session.post(f"{BASE_URL}/packages", json={
        "name": "FEAT-v323-limits",
        "package_type": "umrah",
        "currency": "SAR",
        "pricing_mode": "direct",
        "features": features_40
    })
    
    if resp.status_code == 200:
        data = resp.json()
        created_packages.append(data['id'])
        features = data.get('features', [])
        
        # Verify: max 30 items
        if len(features) <= 30:
            log_test("POST with 40 features - capped at 30", True, f"Got {len(features)} features (max 30)")
        else:
            log_test("POST with 40 features - capped at 30", False, f"Expected ≤30, got {len(features)}")
        
        # Verify: long item truncated to 60
        long_items = [f for f in features if len(f) > 60]
        if len(long_items) == 0:
            log_test("POST with long feature - truncated to 60 chars", True, "All features ≤60 chars")
        else:
            log_test("POST with long feature - truncated to 60 chars", False, f"Found {len(long_items)} items > 60 chars")
    else:
        log_test("POST with 40 features", False, f"Status {resp.status_code}: {resp.text}")
    
    # Test 1.5: GET /api/packages includes features array
    print("\n1.5 - GET /api/packages includes features array")
    resp = session.get(f"{BASE_URL}/packages")
    
    if resp.status_code == 200:
        data = resp.json()
        # Find our test packages
        test_pkgs = [p for p in data if p.get('id') in created_packages]
        if len(test_pkgs) > 0 and all('features' in p for p in test_pkgs):
            log_test("GET /packages includes features array", True, f"Found {len(test_pkgs)} test packages with features")
        else:
            log_test("GET /packages includes features array", False, "Features not found in package list")
    else:
        log_test("GET /packages includes features array", False, f"Status {resp.status_code}: {resp.text}")

def test_2_image_upload_view_delete():
    """TEST 2 — IMAGE upload/view/delete"""
    print("\n=== TEST 2 — IMAGE UPLOAD/VIEW/DELETE ===")
    
    # Create a test package for image tests
    print("\n2.0 - Create test package for image tests")
    resp = session.post(f"{BASE_URL}/packages", json={
        "name": "IMG-v323",
        "package_type": "umrah",
        "currency": "SAR",
        "pricing_mode": "direct",
        "features": ["A", "B"]
    })
    
    if resp.status_code != 200:
        log_test("Create package for image tests", False, f"Status {resp.status_code}: {resp.text}")
        return
    
    pkg_id = resp.json()['id']
    created_packages.append(pkg_id)
    log_test("Create package for image tests", True, f"Package ID: {pkg_id}")
    
    # Test 2.1: POST image (PNG)
    print("\n2.1 - POST /api/packages/:id/image with PNG")
    png_b64 = generate_tiny_png()
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": f"data:image/png;base64,{png_b64}"
    })
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get('saved') == True:
            log_test("POST /packages/:id/image - PNG upload", True, "Image saved")
            
            # Verify has_image=true on package
            resp_get = session.get(f"{BASE_URL}/packages")
            if resp_get.status_code == 200:
                packages = resp_get.json()
                pkg = next((p for p in packages if p.get('id') == pkg_id), None)
                if pkg and pkg.get('has_image') == True:
                    log_test("POST image sets has_image=true", True, "has_image flag set")
                else:
                    log_test("POST image sets has_image=true", False, f"has_image: {pkg.get('has_image') if pkg else 'package not found'}")
            else:
                log_test("POST image sets has_image=true", False, f"GET failed: {resp_get.status_code}")
        else:
            log_test("POST /packages/:id/image - PNG upload", False, f"saved: {data.get('saved')}")
    else:
        log_test("POST /packages/:id/image - PNG upload", False, f"Status {resp.status_code}: {resp.text}")
        return
    
    # Test 2.2: GET image (binary response)
    print("\n2.2 - GET /api/packages/:id/image returns binary PNG")
    resp = session.get(f"{BASE_URL}/packages/{pkg_id}/image")
    
    if resp.status_code == 200:
        content_type = resp.headers.get('Content-Type', '')
        if 'image/png' in content_type:
            # Verify binary content matches
            expected_bytes = base64.b64decode(png_b64)
            if resp.content == expected_bytes:
                log_test("GET /packages/:id/image - binary PNG", True, f"Content-Type: {content_type}, size: {len(resp.content)} bytes")
            else:
                log_test("GET /packages/:id/image - binary PNG", False, f"Content mismatch: expected {len(expected_bytes)} bytes, got {len(resp.content)}")
        else:
            log_test("GET /packages/:id/image - binary PNG", False, f"Wrong Content-Type: {content_type}")
    else:
        log_test("GET /packages/:id/image - binary PNG", False, f"Status {resp.status_code}: {resp.text}")
    
    # Test 2.3: Replace image with JPEG (upsert)
    print("\n2.3 - POST /api/packages/:id/image again (replace with JPEG)")
    jpeg_b64 = generate_tiny_jpeg()
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": f"data:image/jpeg;base64,{jpeg_b64}"
    })
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get('saved') == True:
            log_test("POST image again - replace (upsert)", True, "Image replaced")
            
            # Verify GET returns JPEG now
            resp_get = session.get(f"{BASE_URL}/packages/{pkg_id}/image")
            if resp_get.status_code == 200:
                content_type = resp_get.headers.get('Content-Type', '')
                if 'image/jpeg' in content_type:
                    log_test("GET after replace returns JPEG", True, f"Content-Type: {content_type}")
                else:
                    log_test("GET after replace returns JPEG", False, f"Content-Type: {content_type}")
            else:
                log_test("GET after replace returns JPEG", False, f"GET failed: {resp_get.status_code}")
        else:
            log_test("POST image again - replace (upsert)", False, f"saved: {data.get('saved')}")
    else:
        log_test("POST image again - replace (upsert)", False, f"Status {resp.status_code}: {resp.text}")
    
    # Test 2.4: Invalid format (GIF)
    print("\n2.4 - POST with invalid format (GIF) - should return 400")
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": "data:image/gif;base64,AAAA"
    })
    
    if resp.status_code == 400:
        log_test("POST invalid format (GIF) - 400 error", True, f"Error: {resp.text}")
    else:
        log_test("POST invalid format (GIF) - 400 error", False, f"Expected 400, got {resp.status_code}")
    
    # Test 2.4b: Invalid dataURL format
    print("\n2.4b - POST with invalid dataURL format - should return 400")
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": "hello"
    })
    
    if resp.status_code == 400:
        log_test("POST invalid dataURL format - 400 error", True, f"Error: {resp.text}")
    else:
        log_test("POST invalid dataURL format - 400 error", False, f"Expected 400, got {resp.status_code}")
    
    # Test 2.5: Oversize image (> 4,000,000 chars)
    print("\n2.5 - POST oversize image (> 4M chars) - should return 400")
    # Generate a large base64 string (4.1M chars of 'A')
    oversize_b64 = "A" * 4_100_000
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": f"data:image/png;base64,{oversize_b64}"
    })
    
    if resp.status_code == 400:
        log_test("POST oversize image - 400 error", True, f"Error: {resp.text}")
    else:
        log_test("POST oversize image - 400 error", False, f"Expected 400, got {resp.status_code}")
    
    # Test 2.6: DELETE image
    print("\n2.6 - DELETE /api/packages/:id/image")
    resp = session.delete(f"{BASE_URL}/packages/{pkg_id}/image")
    
    if resp.status_code == 200:
        data = resp.json()
        if data.get('deleted') == True:
            log_test("DELETE /packages/:id/image", True, "Image deleted")
            
            # Verify has_image=false
            resp_get = session.get(f"{BASE_URL}/packages")
            if resp_get.status_code == 200:
                packages = resp_get.json()
                pkg = next((p for p in packages if p.get('id') == pkg_id), None)
                if pkg and pkg.get('has_image') == False:
                    log_test("DELETE sets has_image=false", True, "has_image flag cleared")
                else:
                    log_test("DELETE sets has_image=false", False, f"has_image: {pkg.get('has_image') if pkg else 'package not found'}")
            else:
                log_test("DELETE sets has_image=false", False, f"GET failed: {resp_get.status_code}")
            
            # Verify GET image returns 404
            resp_get_img = session.get(f"{BASE_URL}/packages/{pkg_id}/image")
            if resp_get_img.status_code == 404:
                log_test("GET image after DELETE - 404", True, "Image not found")
            else:
                log_test("GET image after DELETE - 404", False, f"Expected 404, got {resp_get_img.status_code}")
        else:
            log_test("DELETE /packages/:id/image", False, f"deleted: {data.get('deleted')}")
    else:
        log_test("DELETE /packages/:id/image", False, f"Status {resp.status_code}: {resp.text}")

def test_3_duplicate_copies_features_and_image():
    """TEST 3 — DUPLICATE copies features + image"""
    print("\n=== TEST 3 — DUPLICATE COPIES FEATURES + IMAGE ===")
    
    # Create a test package with features and image
    print("\n3.0 - Create test package with features and image")
    resp = session.post(f"{BASE_URL}/packages", json={
        "name": "DUP-v323",
        "package_type": "umrah",
        "currency": "SAR",
        "pricing_mode": "direct",
        "features": ["A", "B"]
    })
    
    if resp.status_code != 200:
        log_test("Create package for duplicate test", False, f"Status {resp.status_code}: {resp.text}")
        return
    
    pkg_id = resp.json()['id']
    created_packages.append(pkg_id)
    log_test("Create package for duplicate test", True, f"Package ID: {pkg_id}")
    
    # Upload image
    print("\n3.1 - Upload image to package")
    png_b64 = generate_tiny_png()
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/image", json={
        "data": f"data:image/png;base64,{png_b64}"
    })
    
    if resp.status_code != 200:
        log_test("Upload image for duplicate test", False, f"Status {resp.status_code}: {resp.text}")
        return
    
    log_test("Upload image for duplicate test", True, "Image uploaded")
    
    # Test 3.2: Duplicate package
    print("\n3.2 - POST /api/packages/:id/duplicate")
    resp = session.post(f"{BASE_URL}/packages/{pkg_id}/duplicate", json={
        "name": "FEAT-COPY-v323"
    })
    
    if resp.status_code == 200:
        data = resp.json()
        copy_id = data.get('id')
        created_packages.append(copy_id)
        
        # Verify features copied
        if data.get('features') == ["A", "B"]:
            log_test("Duplicate copies features", True, f"Features: {data.get('features')}")
        else:
            log_test("Duplicate copies features", False, f"Expected ['A', 'B'], got {data.get('features')}")
        
        # Verify has_image=true
        if data.get('has_image') == True:
            log_test("Duplicate copies has_image flag", True, "has_image=true")
        else:
            log_test("Duplicate copies has_image flag", False, f"has_image: {data.get('has_image')}")
        
        # Test 3.3: GET image from duplicated package
        print("\n3.3 - GET /api/packages/<copyId>/image")
        resp_img = session.get(f"{BASE_URL}/packages/{copy_id}/image")
        
        if resp_img.status_code == 200:
            content_type = resp_img.headers.get('Content-Type', '')
            if 'image/png' in content_type:
                log_test("GET image from duplicated package", True, f"Content-Type: {content_type}, size: {len(resp_img.content)} bytes")
            else:
                log_test("GET image from duplicated package", False, f"Wrong Content-Type: {content_type}")
        else:
            log_test("GET image from duplicated package", False, f"Status {resp_img.status_code}: {resp_img.text}")
    else:
        log_test("POST /packages/:id/duplicate", False, f"Status {resp.status_code}: {resp.text}")

def cleanup():
    """Delete all test packages"""
    print("\n=== CLEANUP ===")
    for pkg_id in created_packages:
        resp = session.delete(f"{BASE_URL}/packages/{pkg_id}")
        if resp.status_code == 200:
            print(f"✅ Deleted package {pkg_id}")
        else:
            print(f"⚠️  Failed to delete package {pkg_id}: {resp.status_code}")
    
    print(f"\n✅ Cleanup complete. Deleted {len(created_packages)} packages.")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for t in test_results if t['passed'])
    failed = sum(1 for t in test_results if not t['passed'])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    
    if failed > 0:
        print("\nFailed tests:")
        for t in test_results:
            if not t['passed']:
                print(f"  ❌ {t['name']}")
                if t['details']:
                    print(f"     {t['details']}")
    
    print("\n" + "="*60)
    
    return failed == 0

def main():
    """Main test runner"""
    print("="*60)
    print("Rahaal ERP v3.23 Backend Test Suite")
    print("Package FEATURES + IMAGE endpoints")
    print("="*60)
    
    if not login():
        print("\n❌ Authentication failed. Exiting.")
        sys.exit(1)
    
    try:
        test_1_features_on_packages()
        test_2_image_upload_view_delete()
        test_3_duplicate_copies_features_and_image()
    except Exception as e:
        print(f"\n❌ Test execution error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cleanup()
    
    success = print_summary()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
