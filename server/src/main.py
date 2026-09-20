import uvicorn
import os
from src.config import config

def main():
    print("Starting Sinatra...")
    
    uvicorn.run(
        "src.server:app", 
        host="0.0.0.0", 
        port=config['port'], 
        reload=True
    )

if __name__ == "__main__":
    main()