PYTHON ?= python3

.PHONY: all etl test

all: etl test

etl:
	$(PYTHON) src/etl.py

test:
	PYTHONPATH=. $(PYTHON) -m unittest discover -s tests -v
